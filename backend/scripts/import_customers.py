#!/usr/bin/env python3
"""Import customers from the sample CSV into the database.

Creates a `customers` table in the existing SQLite DB (backend/db/services.db)
and inserts one row per CSV record with basic fields.

Run from the `backend` folder:
    python scripts/import_customers.py

The script is resilient to being executed as a module or from different CWDs.
"""
import csv
import os
import re
import time
from datetime import datetime

try:
    # when running from backend/ as current working directory
    from db.database import get_db_connection, DB_PATH
except Exception:
    # If package imports fail (script executed directly), fall back to local DB path
    import sqlite3
    DB_PATH = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'db', 'services.db'))

    def get_db_connection():
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn


# Try possible locations for the CSV (scripts folder and parent folder)
dir_here = os.path.dirname(__file__)
candidates = [
    os.path.join(dir_here, 'Customer_Billing_Sample_csv.csv'),
    os.path.normpath(os.path.join(dir_here, '..', 'Customer_Billing_Sample_csv.csv')),
]
CSV_PATH = None
for c in candidates:
    if os.path.exists(c):
        CSV_PATH = os.path.normpath(c)
        break
if CSV_PATH is None:
    # default to first candidate path (used for error message)
    CSV_PATH = os.path.normpath(candidates[0])


def normalize_currency(s):
    if s is None:
        return 0.0
    s = str(s).strip()
    if not s:
        return 0.0
    # remove $ and commas and surrounding quotes
    s = s.replace('$', '').replace(',', '').replace('"', '').strip()
    try:
        return float(s)
    except Exception:
        return 0.0


def normalize_date(s):
    if s is None:
        return None
    s = str(s).strip()
    if not s:
        return None
    # Fix common malformed patterns like '1/82024' -> '1/8/2024'
    m = re.match(r'^(\d+)[/ ]?(\d+)(\d{4})$', s)
    if m:
        s = f"{m.group(1)}/{m.group(2)}/{m.group(3)}"

    for fmt in ('%m/%d/%Y', '%m/%d/%y', '%Y-%m-%d'):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.date().isoformat()
        except Exception:
            continue

    # Try more flexible parse: day/month without leading zeros
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{2,4})$', s)
    if m:
        month, day, year = m.group(1), m.group(2), m.group(3)
        if len(year) == 2:
            year = '20' + year
        try:
            dt = datetime(int(year), int(month), int(day))
            return dt.date().isoformat()
        except Exception:
            return None

    return None


def ensure_customers_table():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_code TEXT UNIQUE,
            last_name TEXT,
            first_name TEXT,
            start_date TEXT,
            end_date TEXT,
            total_amount_due REAL,
            date_of_payment TEXT,
            billing_comments TEXT,
            created_at TEXT
        )
        '''
    )
    conn.commit()
    conn.close()


def ensure_customer_services_table():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS customer_services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            service_name TEXT,
            days INTEGER DEFAULT 0,
            rate_per_day REAL DEFAULT 0.0,
            amount_billed REAL DEFAULT 0.0,
            amount_paid REAL DEFAULT 0.0,
            date_of_payment TEXT,
            created_at TEXT,
            FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
        )
        '''
    )
    conn.commit()
    conn.close()


def import_csv(path=CSV_PATH):
    if not os.path.exists(path):
        print(f"CSV not found: {path}")
        return

    ensure_customers_table()
    ensure_customer_services_table()

    inserted = 0
    skipped = 0
    conn = get_db_connection()
    cur = conn.cursor()

    # We need to parse rows while also extracting per-service columns. The sample CSV layout
    # has the services repeated in order after the End column. We'll use a predefined service order
    # to map triplets of columns: (days, amount billed, amount paid) per service.
    services_order = ['ASSES', 'PHP', 'IOP', 'OP-G', 'OP-Ind', 'Peer-Ind', 'Peer-G', 'MDRN']

    with open(path, newline='', encoding='utf-8') as fh:
        reader = csv.reader(fh)
        header = next(reader)
        # Normalize header entries
        header = [h.strip() if h is not None else '' for h in header]

        # Find indices for core columns
        def find_header(name_variants):
            for v in name_variants:
                if v in header:
                    return header.index(v)
            # case-insensitive
            for i, h in enumerate(header):
                if h and h.strip().lower() in [vv.lower() for vv in name_variants]:
                    return i
            return None

        idx_last = find_header(['Last Name', 'Last Name ' , 'Last Name'])
        idx_first = find_header(['First Name', 'First Name '])
        idx_start = find_header(['Start'])
        idx_end = find_header(['End'])
        idx_total_due = find_header(['Total Amount Due'])
        idx_date_of_payment = find_header(['Date of Payment'])
        idx_billing_comments = find_header(['Billing Comments'])

        # After end index, services appear in sequence. Build service indices mapping
        service_indices = []  # list of tuples (days_idx, billed_idx, paid_idx)
        base = idx_end + 1 if idx_end is not None else None
        if base is not None:
            # Expect 3 columns per service in the order present in CSV
            for i in range(len(services_order)):
                days_i = base + i * 3
                billed_i = base + i * 3 + 1
                paid_i = base + i * 3 + 2
                if days_i < len(header):
                    service_indices.append((days_i, billed_i if billed_i < len(header) else None, paid_i if paid_i < len(header) else None))
                else:
                    service_indices.append((None, None, None))

        for idx_row, cols in enumerate(reader, start=1):
            # helper to safe get
            def val(i):
                return cols[i].strip() if (i is not None and i < len(cols)) else ''

            last_name = val(idx_last) if idx_last is not None else ''
            first_name = val(idx_first) if idx_first is not None else ''
            start = normalize_date(val(idx_start)) if idx_start is not None else None
            end = normalize_date(val(idx_end)) if idx_end is not None else None
            total_amount = normalize_currency(val(idx_total_due)) if idx_total_due is not None else 0.0
            date_of_payment = normalize_date(val(idx_date_of_payment)) if idx_date_of_payment is not None else None
            billing_comments = val(idx_billing_comments) if idx_billing_comments is not None else None

            if not (last_name or first_name):
                skipped += 1
                continue

            customer_code = f"cust-{int(time.time())}-{idx_row}"
            created_at = datetime.utcnow().isoformat()

            try:
                cur.execute(
                    'INSERT OR IGNORE INTO customers (customer_code, last_name, first_name, start_date, end_date, total_amount_due, date_of_payment, billing_comments, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    (
                        customer_code,
                        last_name.strip(),
                        first_name.strip(),
                        start,
                        end,
                        total_amount,
                        date_of_payment,
                        billing_comments,
                        created_at,
                    ),
                )
                conn.commit()
                # get the customer id (insert or existing)
                cur.execute('SELECT id FROM customers WHERE customer_code = ?', (customer_code,))
                rowcust = cur.fetchone()
                if rowcust:
                    customer_id = rowcust[0]
                    inserted += 1
                else:
                    skipped += 1
                    continue
            except Exception as e:
                print(f"Row {idx_row} insert failed: {e}")
                skipped += 1
                continue

            # Insert service lines for this customer
            for s_idx, svc in enumerate(services_order):
                days_idx, billed_idx, paid_idx = service_indices[s_idx] if s_idx < len(service_indices) else (None, None, None)
                days = 0
                billed = 0.0
                paid = 0.0
                try:
                    days = int(val(days_idx)) if val(days_idx) else 0
                except Exception:
                    days = 0
                billed = normalize_currency(val(billed_idx)) if billed_idx is not None else 0.0
                paid = normalize_currency(val(paid_idx)) if paid_idx is not None else 0.0

                # If there's meaningful data, store a customer_service row
                if days or billed or paid:
                    # Attempt to lookup rate_per_day from services table
                    rate_per_day = 0.0
                    try:
                        cur2 = conn.cursor()
                        cur2.execute('SELECT rate_per_day FROM services WHERE name = ?', (svc,))
                        r = cur2.fetchone()
                        if r and r[0] is not None:
                            rate_per_day = float(r[0])
                        cur2.close()
                    except Exception:
                        rate_per_day = 0.0

                    created_svc_at = datetime.utcnow().isoformat()
                    try:
                        cur.execute(
                            'INSERT INTO customer_services (customer_id, service_name, days, rate_per_day, amount_billed, amount_paid, date_of_payment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                            (customer_id, svc, days, rate_per_day, billed, paid, date_of_payment, created_svc_at),
                        )
                        conn.commit()
                    except Exception as e:
                        print(f"Failed to insert service row for customer {customer_id}: {e}")
                        # continue with next service
                        continue

    conn.close()
    print(f"Imported: {inserted}, Skipped: {skipped}")


if __name__ == '__main__':
    print(f"Using DB: {DB_PATH}")
    import_csv()
