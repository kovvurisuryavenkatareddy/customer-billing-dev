from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from fastapi import Form
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from typing import Optional
import hashlib
import jwt
import os
import secrets

# Import DB helper
try:
    from db.database import get_db_connection
except Exception:
    from ..db.database import get_db_connection

router = APIRouter()
# OAuth2 password flow (used by Swagger UI to prompt username/password)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

# JWT Configuration: use a stable key from env so tokens survive server restarts.
# If not set, fall back to a fixed dev default (do not use random per-process in production).
SECRET_KEY = os.environ.get("JWT_SECRET_KEY") or os.environ.get("SECRET_KEY") or "xf4eUpmuXWQYm3bS4yDW7TcQFAEDmctJSV7gziw21qw"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours


# Pydantic models
class UserSignup(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


class UserResponse(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    created_at: str


_users_table_ensured = False

def ensure_users_table():
    """Create users table if it doesn't exist. Runs only once per process."""
    global _users_table_ensured
    if _users_table_ensured:
        return
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            '''
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL,
                last_login TIMESTAMP
            )
            '''
        )
        conn.commit()
        _users_table_ensured = True
    finally:
        conn.close()


# NOTE: table creation is done at application startup to avoid attempting
# to connect to the database during module import (which can crash when
# the DB is unreachable). The function `ensure_users_table` remains
# available and routes call it on-demand when needed.


def hash_password(password: str) -> str:
    """Hash password using SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return hash_password(plain_password) == hashed_password


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str):
    """Decode and verify JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired"
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )


def get_current_user(token: str = Depends(oauth2_scheme)):
    """Dependency to get current authenticated user from token.
    Uses OAuth2 password flow bearer token (or Bearer token) so Swagger UI can obtain tokens
    via the `/auth/token` endpoint (username/password). This remains compatible with clients
    that pass a Bearer token in the `Authorization` header.
    """
    payload = decode_token(token)
    user_id = payload.get("user_id")
    
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    
    # Fetch user from database
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        user = cur.fetchone()
    finally:
        conn.close()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    return dict(user)


@router.post("/signup", response_model=Token, status_code=status.HTTP_201_CREATED)
def signup(user_data: UserSignup):
    """Register a new user"""
    ensure_users_table()
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Check if user already exists
        cur.execute("SELECT id FROM users WHERE email = ?", (user_data.email,))
        if cur.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Hash password
        password_hash = hash_password(user_data.password)
        
        # Create user
        created_at = datetime.utcnow().isoformat()
        cur.execute(
            '''
            INSERT INTO users (email, password_hash, first_name, last_name, created_at)
            VALUES (?, ?, ?, ?, ?) RETURNING *
            ''',
            (user_data.email, password_hash, user_data.first_name, user_data.last_name, created_at)
        )
        conn.commit()
        user = dict(cur.fetchone())
        
        # Create access token
        access_token = create_access_token(
            data={"user_id": user["id"], "email": user["email"]}
        )
        
        # Remove password hash from response
        user_response = {
            "id": user["id"],
            "email": user["email"],
            "first_name": user["first_name"],
            "last_name": user["last_name"],
            "created_at": user["created_at"]
        }
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": user_response
        }
        
    except Exception as e:
        conn.rollback()
        if 'unique constraint' in str(e).lower() or 'duplicate key' in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        raise
    finally:
        conn.close()


@router.post("/login", response_model=Token)
def login(credentials: UserLogin):
    """Authenticate user with JSON body (email/password) and return JWT token
    Keeps backward compatibility for existing clients.
    """
    ensure_users_table()
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Find user by email
        cur.execute("SELECT * FROM users WHERE email = ?", (credentials.email,))
        user = cur.fetchone()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password"
            )
        
        user_dict = dict(user)
        
        # Verify password
        if not verify_password(credentials.password, user_dict["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password"
            )
        
        # Update last login
        cur.execute(
            "UPDATE users SET last_login = ? WHERE id = ?",
            (datetime.utcnow().isoformat(), user_dict["id"])
        )
        conn.commit()
        
        # Create access token
        access_token = create_access_token(
            data={"user_id": user_dict["id"], "email": user_dict["email"]}
        )
        
        # Remove password hash from response
        user_response = {
            "id": user_dict["id"],
            "email": user_dict["email"],
            "first_name": user_dict["first_name"],
            "last_name": user_dict["last_name"],
            "created_at": user_dict["created_at"]
        }
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": user_response
        }
        
    finally:
        conn.close()


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user information"""
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "first_name": current_user["first_name"],
        "last_name": current_user["last_name"],
        "created_at": current_user["created_at"]
    }


@router.post("/logout")
def logout(current_user: dict = Depends(get_current_user)):
    """Logout user (client should discard token)"""
    # In a real application, you might want to blacklist the token
    # For now, client-side token removal is sufficient
    return {"message": "Successfully logged out"}


@router.post("/token", response_model=Token)
def token(username: str = Form(...), password: str = Form(...)):
    """OAuth2 token endpoint (password grant) used by Swagger UI.
    Accepts form fields 'username' and 'password' and returns a JWT access token.
    This keeps Swagger UI able to request a token using username/password.
    """
    # Map form fields: username -> email
    email = username

    ensure_users_table()
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM users WHERE email = ?", (email,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="Incorrect email or password")
        user_dict = dict(user)
        if not verify_password(password, user_dict["password_hash"]):
            raise HTTPException(status_code=401, detail="Incorrect email or password")

        # Update last login
        cur.execute(
            "UPDATE users SET last_login = ? WHERE id = ?",
            (datetime.utcnow().isoformat(), user_dict["id"]) 
        )
        conn.commit()

        access_token = create_access_token(data={"user_id": user_dict["id"], "email": user_dict["email"]})

        user_response = {
            "id": user_dict["id"],
            "email": user_dict["email"],
            "first_name": user_dict["first_name"],
            "last_name": user_dict["last_name"],
            "created_at": user_dict["created_at"]
        }

        return {"access_token": access_token, "token_type": "bearer", "user": user_response}
    finally:
        conn.close()
