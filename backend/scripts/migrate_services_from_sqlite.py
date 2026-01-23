#!/usr/bin/env python3
"""
Migrate services from the existing SQLite DB into the Postgres `services` table.

Behavior:
- Reads distinct service names from `services` (if present) or `customer_services`/`customer_services`-like table.
- Attempts to obtain `rate_per_day` and `default_days` where available. If only `amount_billed` and `days` exist, rate_per_day = amount_billed/days.
- Inserts rows into Postgres `services` table using `name` as unique key. Uses ON CONFLICT DO NOTHING to be idempotent.

Usage:
  Set `DATABASE_URL` in environment (or in ../.env), then run:
    python migrate_services_from_sqlite.py

"""
import os
import sqlite3
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv


load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../.env'))


def get_sqlite_conn(sqlite_path):
    if not os.path.exists(sqlite_path):
        raise FileNotFoundError(f"SQLite DB not found at {sqlite_path}")
    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    return conn


def get_pg_conn(pg_url):
    if not pg_url:
        raise RuntimeError('DATABASE_URL not set')
    return psycopg2.connect(pg_url)


def gather_services_from_sqlite(sqlite_conn):
    cur = sqlite_conn.cursor()
    services = {}

    # Try to read canonical services table first (if it exists)
    try:
        cur.execute('SELECT name, rate_per_day, default_days FROM services')
        for r in cur.fetchall():
            if not r['name']: 
                continue
            name = str(r['name']).strip()
            rate = r['rate_per_day'] if r['rate_per_day'] is not None else None
            dd = r['default_days'] if r['default_days'] is not None else None
            services[name.lower()] = {'name': name, 'rate': rate, 'default_days': dd}
        if services:
            print(f"Found {len(services)} canonical services in SQLite 'services' table.")
            return list(services.values())
    except Exception:
        # table may not exist — ignore
        pass

    # Fallback: inspect customer_services or customer_services-like table
    candidates = ['customer_services', 'customer_service', 'customer_services_v2']
    for table in candidates:
        try:
            cur.execute(f"SELECT service_name, rate_per_day, amount_billed, days FROM {table}")
            rows = cur.fetchall()
            if not rows:
                continue
            for r in rows:
                svc = r['service_name'] if 'service_name' in r.keys() else None
                if not svc:
                    continue
                name = str(svc).strip()
                key = name.lower()
                rate = None
                if 'rate_per_day' in r.keys() and r['rate_per_day'] is not None:
                    rate = r['rate_per_day']
                else:
                    # try to compute from amount_billed/days
                    if 'amount_billed' in r.keys() and r['amount_billed'] is not None and 'days' in r.keys() and r['days']:
                        try:
                            days = float(r['days'])
                            if days and days != 0:
                                rate = float(r['amount_billed']) / days
                        except Exception:
                            rate = None
                dd = None
                if 'days' in r.keys() and r['days']:
                    try:
                        dd = int(r['days'])
                    except Exception:
                        dd = None

                if key in services:
                    # prefer existing rate if present, otherwise set
                    if services[key].get('rate') is None and rate is not None:
                        services[key]['rate'] = rate
                    if services[key].get('default_days') is None and dd is not None:
                        services[key]['default_days'] = dd
                else:
                    services[key] = {'name': name, 'rate': rate, 'default_days': dd}
            if services:
                print(f"Extracted {len(services)} unique services from table '{table}'.")
                return list(services.values())
        except Exception:
            # table missing — ignore
            continue

    print('No services found in SQLite DB. Nothing to migrate.')
    return []


def upsert_services_into_postgres(pg_conn, services):
    cur = pg_conn.cursor()
    inserted = 0
    for s in services:
        name = s.get('name')
        if not name:
            continue
        rate = s.get('rate') if s.get('rate') is not None else 0.0
        dd = s.get('default_days') if s.get('default_days') is not None else 1
        try:
            # Use parameterized query and ON CONFLICT DO NOTHING on name
            cur.execute(
                'INSERT INTO services (name, rate_per_day, default_days) VALUES (%s, %s, %s) ON CONFLICT (name) DO UPDATE SET rate_per_day = COALESCE(EXCLUDED.rate_per_day, services.rate_per_day), default_days = COALESCE(EXCLUDED.default_days, services.default_days)',
                (name, float(rate), int(dd))
            )
            inserted += 1
        except Exception as e:
            print(f"Failed to insert service {name}: {e}")
            pg_conn.rollback()
            continue
    pg_conn.commit()
    print(f"Upserted {inserted} service rows into Postgres.")


def main():
    SQLITE_PATH = os.path.join(os.path.dirname(__file__), '../db/services.db')
    PG_URL = os.environ.get('DATABASE_URL')
    if not PG_URL:
        raise RuntimeError('Set DATABASE_URL to your Postgres connection string (or in ../.env)')

    print(f"Opening SQLite DB at: {SQLITE_PATH}")
    sqlite_conn = get_sqlite_conn(SQLITE_PATH)
    services = gather_services_from_sqlite(sqlite_conn)
    sqlite_conn.close()

    if not services:
        print('No services to migrate. Exiting.')
        return

    print(f"Connecting to Postgres: {PG_URL}")
    pg_conn = get_pg_conn(PG_URL)
    try:
        upsert_services_into_postgres(pg_conn, services)
    finally:
        pg_conn.close()


if __name__ == '__main__':
    main()
