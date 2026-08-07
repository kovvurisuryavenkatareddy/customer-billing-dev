import os
import traceback
import threading
import psycopg2
import psycopg2.extras
import psycopg2.pool

DATABASE_URL = os.getenv('DATABASE_URL')
# Optional schema to use for all connections. If set, we will ensure the schema
# exists and set the session search_path so unqualified table names resolve
# into this schema first.
DATABASE_SCHEMA = os.getenv('DATABASE_SCHEMA') or 'public'
if not DATABASE_URL:
    raise RuntimeError('DATABASE_URL environment variable must be set for PostgreSQL connection.')

_pool: 'psycopg2.pool.ThreadedConnectionPool | None' = None
_pool_lock = threading.Lock()


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    """Return the singleton connection pool, creating it on first call."""
    global _pool
    if _pool is not None:
        return _pool
    with _pool_lock:
        if _pool is None:
            _pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=2,
                maxconn=20,
                dsn=DATABASE_URL,
                # TCP keepalives prevent Neon from closing idle connections
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=10,
                keepalives_count=5,
            )
    return _pool


def _apply_schema(conn) -> None:
    """Set the search_path on a freshly acquired connection."""
    if DATABASE_SCHEMA and DATABASE_SCHEMA.lower() != 'public':
        try:
            cur = conn.cursor()
            cur.execute(f'SET search_path TO "{DATABASE_SCHEMA}", public')
            cur.close()
            conn.commit()
        except Exception:
            traceback.print_exc()


class _PGConnWrapper:
    """Wraps a pooled psycopg2 connection.
    - cursor() returns RealDictCursor so rows behave like dicts.
    - close() rolls back any open transaction, then returns the connection to
      the pool instead of closing it.
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
        """Rollback any open transaction, then return the connection to the pool.
        If the connection turns out to be dead (e.g. Neon closed it server-side),
        discard it instead of returning it to the pool for someone else to fail on.
        """
        try:
            if self._conn.status == psycopg2.extensions.STATUS_IN_TRANSACTION:
                self._conn.rollback()
            _get_pool().putconn(self._conn)
        except Exception:
            try:
                _get_pool().putconn(self._conn, close=True)
            except Exception:
                try:
                    self._conn.close()
                except Exception:
                    pass

    def __getattr__(self, name):
        return getattr(self._conn, name)


_MAX_GETCONN_ATTEMPTS = 3


def get_db_connection() -> _PGConnWrapper:
    """Get a connection from the pool. Always call conn.close() when done
    (it returns the connection to the pool rather than closing it).

    Neon (and other serverless Postgres) can close idle connections server-side
    without telling the pool, which otherwise hands out a dead connection that
    fails on first use (psycopg2.InterfaceError: connection already closed).
    Ping each connection with a trivial query before returning it; if that
    fails, discard the connection and try again with a fresh one.
    """
    pool = _get_pool()
    last_exc = None
    for _ in range(_MAX_GETCONN_ATTEMPTS):
        try:
            conn = pool.getconn()
        except Exception:
            traceback.print_exc()
            raise

        try:
            # Reset any aborted transaction state before handing the connection out
            if conn.status == psycopg2.extensions.STATUS_IN_TRANSACTION:
                conn.rollback()

            # Cheap liveness check — catches connections Neon already closed.
            probe = conn.cursor()
            probe.execute('SELECT 1')
            probe.fetchone()
            probe.close()

            _apply_schema(conn)
            return _PGConnWrapper(conn)
        except (psycopg2.InterfaceError, psycopg2.OperationalError) as e:
            print(f"get_db_connection: discarding dead pooled connection ({e}), retrying...")
            last_exc = e
            try:
                pool.putconn(conn, close=True)
            except Exception:
                pass
            continue
        except Exception:
            traceback.print_exc()
            raise

    raise last_exc or RuntimeError('Failed to obtain a live database connection')
