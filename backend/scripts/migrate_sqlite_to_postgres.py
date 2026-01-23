import os
import sqlite3
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path="../.env")

def get_sqlite_conn(sqlite_path):
    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    return conn

def get_pg_conn(pg_url):
    return psycopg2.connect(pg_url)

def copy_table(sqlite_conn, pg_conn, table, columns, id_col='id'):
    sqlite_cur = sqlite_conn.cursor()
    pg_cur = pg_conn.cursor()
    sqlite_cur.execute(f'SELECT {", ".join(columns)} FROM {table}')
    rows = sqlite_cur.fetchall()
    if not rows:
        print(f"No data to migrate for table {table}")
        return
    # Build insert statement
    col_list = ', '.join(columns)
    placeholders = ', '.join(['%s'] * len(columns))
    insert_sql = f'INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT ({id_col}) DO NOTHING'
    for row in rows:
        values = [row[col] for col in columns]
        pg_cur.execute(insert_sql, values)
    pg_conn.commit()
    print(f"Migrated {len(rows)} rows to {table}")

def main():
    SQLITE_PATH = os.path.join(os.path.dirname(__file__), '../db/services.db')
    PG_URL = os.environ.get('DATABASE_URL')
    if not PG_URL:
        raise RuntimeError('Set DATABASE_URL to your Postgres connection string.')
    print(f"Connecting to SQLite: {SQLITE_PATH}")
    print(f"Connecting to Postgres: {PG_URL}")
    sqlite_conn = get_sqlite_conn(SQLITE_PATH)
    pg_conn = get_pg_conn(PG_URL)
    # Ensure tables exist in Postgres (run your app once to auto-create, or do it here)
    # Migrate customers
    customer_cols = [
        'id', 'customer_code', 'last_name', 'first_name', 'total_amount_due',
        'date_of_payment', 'billing_comments', 'created_at', 'date_of_birth', 'active_status'
    ]
    copy_table(sqlite_conn, pg_conn, 'customers', customer_cols)
    # Migrate customer_services
    service_cols = [
        'id', 'customer_id', 'service_name', 'days', 'rate_per_day', 'amount_billed',
        'amount_paid', 'date_of_payment', 'start_date', 'end_date', 'created_at'
    ]
    copy_table(sqlite_conn, pg_conn, 'customer_services', service_cols)
    sqlite_conn.close()
    pg_conn.close()
    print('Migration complete.')

if __name__ == '__main__':
    main()
