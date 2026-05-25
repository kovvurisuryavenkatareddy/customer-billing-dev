#Main branch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
import os
from dotenv import load_dotenv
import logging

# Load environment variables from .env file
load_dotenv()

# resilient imports for routers and db helper (works when running from backend/ or as package)
try:
    from routes.services import router as services_router
    from routes.customers import router as customers_router
    from routes.auth import router as auth_router
    from routes.billing_import import router as billing_import_router
    from db.database import get_db_connection
except Exception:
    from .routes.services import router as services_router
    from .routes.customers import router as customers_router
    from .routes.auth import router as auth_router
    from .routes.billing_import import router as billing_import_router
    from .db.database import get_db_connection



app = FastAPI(title='Services API')

# Compress responses ≥ 1 KB — reduces JSON payload size by ~70 %
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Configure detailed logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Allow CORS from the frontend dev server
app.add_middleware(
    CORSMiddleware,
    # During local development allow everything; tighten in production
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(services_router, prefix='/services', tags=['Services'])
app.include_router(customers_router, prefix='/customers', tags=['Customers'])
app.include_router(auth_router, prefix='/auth', tags=['Authentication'])
app.include_router(billing_import_router, prefix='/billing', tags=['Billing Import'])


@app.on_event("startup")
def startup_tasks():
    """Run lightweight initialization that may touch the DB.
    This is executed when the ASGI app is started (uvicorn), not at import
    time when running `python main.py` or when modules are imported by tests.
    We catch and log exceptions so the process doesn't crash during import
    if the database is temporarily unreachable.
    """
    try:
        # Import table-creation helpers from route modules and call them here.
        # Wrap each call to ensure a single failing init doesn't prevent others.
        try:
            from routes.auth import ensure_users_table
        except Exception:
            from .routes.auth import ensure_users_table

        try:
            from routes.services import ensure_services_table, ensure_services_columns
        except Exception:
            from .routes.services import ensure_services_table, ensure_services_columns

        try:
            from routes.customers import ensure_all_tables
        except Exception:
            from .routes.customers import ensure_all_tables

        logger.info("Running DB initialization tasks...")

        # Run safe initializers; each is wrapped to avoid a single failure aborting
        try:
            ensure_users_table()
            logger.info("Users table ensured")
        except Exception as e:
            logger.warning("ensure_users_table failed: %s", e)

        try:
            ensure_services_table()
            ensure_services_columns()
            logger.info("Services table ensured")
        except Exception as e:
            logger.warning("ensure_services_table/columns failed: %s", e)

        try:
            ensure_all_tables()
            logger.info("Customer tables ensured")
        except Exception as e:
            logger.warning("ensure_all_tables failed: %s", e)

        logger.info("DB initialization tasks finished.")
    except Exception as e:
        logger.warning("Unexpected error during DB initialization: %s", e)


if __name__ == '__main__':
    # Run with: python backend/main.py  OR: uvicorn backend.main:app --reload --port 8000
    import uvicorn
    
    # Tables are automatically created when routes are imported
    # No need for manual initialization since we're using Postgres
    print("Starting FastAPI server with Postgres backend...")
    uvicorn.run('main:app', host='0.0.0.0', port=8000, reload=True)
