import os
import traceback
import psycopg2
import psycopg2.extras

DATABASE_URL = os.getenv('DATABASE_URL')
# Optional schema to use for all connections. If set, we will ensure the schema
# exists and set the session search_path so unqualified table names resolve
# into this schema first.
DATABASE_SCHEMA = os.getenv('DATABASE_SCHEMA') or 'public'
if not DATABASE_URL:
    raise RuntimeError('DATABASE_URL environment variable must be set for PostgreSQL connection.')

class _PGConnWrapper:
    """Wrap a psycopg2 connection to provide a .cursor() returning a RealDictCursor
    so code that expects dict-like rows (r['id']) continues to work.
    """
    def __init__(self, conn):
        self._conn = conn

    class _CursorProxy:
        def __init__(self, cur):
            self._cur = cur

        def execute(self, sql, params=None):
            # translate sqlite-style ? placeholders to psycopg2 %s placeholders
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
        return self._conn.close()

    # expose execute/fetch helpers optionally
    def __getattr__(self, name):
        return getattr(self._conn, name)

def get_db_connection():
    """Return a psycopg2 connection wrapper using `DATABASE_URL`.
    The wrapper's cursor() will return RealDictCursor so route code can keep
    treating rows like dictionaries.
    """
    try:
        conn = psycopg2.connect(DATABASE_URL)

        # If a non-public schema is configured, try to ensure it exists and
        # set the search_path so unqualified table names use it.
        if DATABASE_SCHEMA and DATABASE_SCHEMA.lower() != 'public':
            try:
                cur = conn.cursor()
                # Create schema if it doesn't exist. If permission is missing,
                # this will raise and we'll continue without aborting the connection.
                cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{DATABASE_SCHEMA}"')
                cur.execute(f'SET search_path TO "{DATABASE_SCHEMA}", public')
                cur.close()
                conn.commit()
            except Exception:
                # don't fail the whole connection when schema creation isn't allowed;
                # log the traceback and continue so callers can decide how to proceed.
                traceback.print_exc()

        return _PGConnWrapper(conn)
    except Exception:
        traceback.print_exc()
        raise
