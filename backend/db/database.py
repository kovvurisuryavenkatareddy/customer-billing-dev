import os
import traceback
import threading
import psycopg2
import psycopg2.extras
import psycopg2.pool

DATABASE_SCHEMA = os.getenv('DATABASE_SCHEMA') or 'public'

# --- Connection pool (initialized once on first use) ---
_pool: psycopg2.pool.ThreadedConnectionPool | None = None
_pool_lock = threading.Lock()

def _get_database_url():
    url = os.getenv('DATABASE_URL')
    if not url:
        raise RuntimeError(
            'DATABASE_URL environment variable must be set. '
            'Add it to backend/.env: DATABASE_URL=postgresql://user:password@host:port/database'
        )
    return url

def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    """Return the shared connection pool, creating it on first call."""
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:  # double-checked locking
                url = _get_database_url()
                _pool = psycopg2.pool.ThreadedConnectionPool(
                    minconn=2,
                    maxconn=10,
                    dsn=url,
                )
    return _pool


class _PGConnWrapper:
    """Wraps a pooled psycopg2 connection.
    - cursor() returns RealDictCursor so rows behave like dicts.
    - close() returns the connection to the pool instead of closing it.
    - Translates SQLite-style ? placeholders to %s automatically.
    """

    def __init__(self, conn):
        self._conn = conn

    class _CursorProxy:
        def __init__(self, cur):
            self._cur = cur

        def execute(self, sql, params=None):
            if params is not None and '?' in sql:
                sql = sql.replace('?', '%s')
            return self._cur.execute(sql, params or None)

        def executemany(self, sql, seq_of_params):
            if seq_of_params and '?' in sql:
                sql = sql.replace('?', '%s')
            return self._cur.executemany(sql, seq_of_params)

        def fetchone(self):
            return self._cur.fetchone()

        def fetchall(self):
            return self._cur.fetchall()

        def __iter__(self):
            return iter(self._cur)

        def __getattr__(self, name):
            return getattr(self._cur, name)

    def cursor(self):
        real = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        return _PGConnWrapper._CursorProxy(real)

    def commit(self):
        return self._conn.commit()

    def rollback(self):
        return self._conn.rollback()

    def close(self):
        """Return connection to pool instead of closing it."""
        try:
            _get_pool().putconn(self._conn)
        except Exception:
            try:
                self._conn.close()
            except Exception:
                pass

    def __getattr__(self, name):
        return getattr(self._conn, name)


def get_db_connection() -> _PGConnWrapper:
    """Get a connection from the pool. Always call conn.close() when done
    (it returns the connection to the pool, not actually close it).
    """
    try:
        pool = _get_pool()
        conn = pool.getconn()

        # Reset any aborted transaction state
        if conn.status == psycopg2.extensions.STATUS_IN_TRANSACTION:
            conn.rollback()

        # Set schema search path if needed
        if DATABASE_SCHEMA and DATABASE_SCHEMA.lower() != 'public':
            try:
                cur = conn.cursor()
                cur.execute(f'SET search_path TO "{DATABASE_SCHEMA}", public')
                cur.close()
            except Exception:
                traceback.print_exc()

        return _PGConnWrapper(conn)
    except Exception:
        traceback.print_exc()
        raise
