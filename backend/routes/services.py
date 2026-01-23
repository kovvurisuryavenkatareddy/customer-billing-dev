from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List
import os

from db.database import get_db_connection
from routes.auth import get_current_user
    


# Ensure services table exists when this routes module is loaded (Postgres only)
def ensure_services_table():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            '''
            CREATE TABLE IF NOT EXISTS services (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                rate_per_day DOUBLE PRECISION DEFAULT 0.0,
                default_days INTEGER DEFAULT 1
            )
            '''
        )
        conn.commit()
        conn.close()
    except Exception:
        import traceback; traceback.print_exc()

# Add default_days column if missing (Postgres)
def ensure_services_columns():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'services'")
        cols = {r['column_name'] for r in cur.fetchall()}
        if 'default_days' not in cols:
            cur.execute('ALTER TABLE services ADD COLUMN default_days INTEGER DEFAULT 1')
        conn.commit()
    finally:
        conn.close()

# NOTE: Table creation and migration helpers are available but are executed
# at application startup (in `main.py`) rather than at module import time.
# This prevents import-time DB connections which can crash when the DB is
# temporarily unreachable.


router = APIRouter()


class ServiceIn(BaseModel):
    name: str = Field(..., min_length=1)
    rate_per_day: float = 0.0
    default_days: int = 1


class ServiceOut(ServiceIn):
    id: int


@router.post('/', response_model=ServiceOut, status_code=201)
def add_service(s: ServiceIn, current_user: dict = Depends(get_current_user)):
    name = s.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail='name is required')

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO services (name, rate_per_day, default_days) VALUES (?, ?, ?)',
            (name, s.rate_per_day, getattr(s, 'default_days', 1)),
        )
        conn.commit()
        # Get the inserted service
        cur.execute('SELECT id, name, rate_per_day, default_days FROM services WHERE name = ?', (name,))
        row = cur.fetchone()
        return dict(row)
    except Exception as e:
        conn.rollback()
        if 'unique constraint' in str(e).lower() or 'duplicate key' in str(e).lower():
            raise HTTPException(status_code=409, detail='service with this name already exists')
        raise
    finally:
        conn.close()


@router.get('/', response_model=List[ServiceOut])
def list_services(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute('SELECT id, name, rate_per_day, default_days FROM services ORDER BY id')
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.post('/seed', status_code=201)
def seed_services(current_user: dict = Depends(get_current_user)):
    """Seed canonical services into the services table (non-destructive).
    Useful during development. Repeated calls are idempotent for names.
    """
    defaults = [
        ('ASSES', 100.0, 1),
        ('PHP', 150.0, 3),
        ('IOP', 120.0, 5),
        ('OP-G', 130.0, 2),
        ('OP-Ind', 130.0, 2),
        ('Peer-Ind', 110.0, 4),
        ('Peer-G', 110.0, 4),
        ('MDRN', 90.0, 7),
    ]
    conn = get_db_connection()
    cur = conn.cursor()
    inserted = []
    try:
        for name, rate, days in defaults:
            try:
                cur.execute('INSERT INTO services (name, rate_per_day, default_days) VALUES (?,?,?)', (name, rate, days))
                inserted.append(name)
            except Exception:
                # ignore duplicates or other insert errors for idempotence
                conn.rollback()
        conn.commit()
    finally:
        conn.close()
    return { 'inserted': inserted }


@router.get('/{service_id}', response_model=ServiceOut)
def get_service(service_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute('SELECT * FROM services WHERE id = ?', (service_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail='service not found')
        return dict(row)
    finally:
        conn.close()


@router.put('/{service_id}', response_model=ServiceOut)
def update_service(service_id: int, s: ServiceIn, current_user: dict = Depends(get_current_user)):
    name = s.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail='name is required')

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        # Check exists
        cur.execute('SELECT * FROM services WHERE id = ?', (service_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail='service not found')

        try:
            cur.execute(
                'UPDATE services SET name = ?, rate_per_day = ?, default_days = ? WHERE id = ?',
                (name, s.rate_per_day, getattr(s, 'default_days', 1), service_id),
            )
            conn.commit()
        except Exception as e:
            conn.rollback()
            if 'unique constraint' in str(e).lower() or 'duplicate key' in str(e).lower():
                raise HTTPException(status_code=409, detail='service with this name already exists')
            raise

        cur.execute('SELECT * FROM services WHERE id = ?', (service_id,))
        row = cur.fetchone()
        return dict(row)
    finally:
        conn.close()


@router.delete('/{service_id}', status_code=204)
def delete_service(service_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute('SELECT * FROM services WHERE id = ?', (service_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail='service not found')

        cur.execute('DELETE FROM services WHERE id = ?', (service_id,))
        conn.commit()
        return None
    finally:
        conn.close()
