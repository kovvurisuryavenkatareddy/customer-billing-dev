from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional, List, Any
from pydantic import BaseModel
from datetime import datetime
import logging
import csv
import os
import json
import uuid

# module logger
logger = logging.getLogger(__name__)

# import DB helper resiliently (absolute then relative)
try:
    from db.database import get_db_connection
    from routes.auth import get_current_user
except Exception:
    from ..db.database import get_db_connection
    from .auth import get_current_user

router = APIRouter()

def _get_or_create_canonical_batch_id(cur, customer_id: int) -> str:
    """
    Enforce a single batch_id per customer.
    Canonical batch_id = the oldest non-empty batch_id for this customer (by created_at),
    or a newly generated UUID if none exists yet.
    """
    cur.execute(
        """
        SELECT batch_id
        FROM customer_entries
        WHERE customer_id = ? AND batch_id IS NOT NULL AND batch_id != ''
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        """,
        (customer_id,)
    )
    row = cur.fetchone()
    existing = row.get('batch_id') if isinstance(row, dict) else (row[0] if row else None)
    if existing:
        return str(existing)
    return str(uuid.uuid4())


# Pydantic models for clearer OpenAPI schemas
class ServiceModel(BaseModel):
    serviceName: Optional[str] = None
    days: Optional[int] = None
    ratePerDay: Optional[float] = None
    amountBilled: Optional[float] = None
    amountPaid: Optional[float] = None
    dateOfPayment: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    dateSubmitted: Optional[str] = None
    denialCodes: Optional[List[str]] = None
    comments: Optional[str] = None
    class Config:
        schema_extra = {
            "example": {
                "serviceName": "Home Health Visit",
                "days": 5,
                "ratePerDay": 125.0,
                "amountBilled": 625.0,
                "amountPaid": 0.0,
                "startDate": "2025-10-01",
                "endDate": "2025-10-05",
                "dateSubmitted": "2025-10-06",
                "denialCodes": ["D1","D2"],
                "comments": "Initial submission"
            }
        }


class CustomerModel(BaseModel):
    customerCode: Optional[str] = None
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    dateOfBirth: Optional[str] = None
    activeStatus: Optional[str] = 'active'
    comments: Optional[str] = None
    idNumber: Optional[str] = None
    fIdNumber: Optional[str] = None
    class Config:
        schema_extra = {
            "example": {
                "customerCode": "CUST-001",
                "firstName": "Jane",
                "lastName": "Doe",
                "dateOfBirth": "1975-04-12",
                "activeStatus": "active",
                "comments": "Preferred contact by email"
            }
        }


class CreateCustomerPayload(BaseModel):
    customer: CustomerModel
    services: Optional[List[ServiceModel]] = None
    service: Optional[ServiceModel] = None  # Keep for backward compatibility
    class Config:
        schema_extra = {
            "example": {
                "customer": CustomerModel.Config.schema_extra["example"],
                "services": [ServiceModel.Config.schema_extra["example"]]
            }
        }


class UpdateCustomerPayload(BaseModel):
    customer: CustomerModel
    services: Optional[List[ServiceModel]] = None
    service: Optional[ServiceModel] = None  # Keep for backward compatibility
    isResubmission: Optional[bool] = False
    class Config:
        schema_extra = {
            "example": {
                "customer": CustomerModel.Config.schema_extra["example"],
                "services": [ServiceModel.Config.schema_extra["example"]],
                "isResubmission": False
            }
        }


class ServiceWrapper(BaseModel):
    service: ServiceModel


class ResubmissionPayload(BaseModel):
    originalEntryId: int
    service: Optional[ServiceModel] = None


class BatchCreatePayload(BaseModel):
    """Create a new batch: N rows with same batch_id (UUID)."""
    services: List[ServiceModel]


class BatchUpdatePayload(BaseModel):
    """Update only entries in this batch (by id)."""
    services: List[dict]  # each may have id, serviceName, days, ratePerDay, etc.

class BackfillBatchIdsPayload(BaseModel):
    """
    Backfill missing customer_entries.batch_id for existing data.
    Groups consecutive NULL/empty batch rows per customer within a time window into one new UUID batch.
    """
    windowSeconds: int = 60
    dryRun: bool = True


def ensure_customers_table():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS customers (
            id SERIAL PRIMARY KEY,
            customer_code TEXT UNIQUE,
            last_name TEXT,
            first_name TEXT,
            date_of_birth TEXT,
            active_status TEXT DEFAULT 'active',
            billing_comments TEXT,
            id_number TEXT,
            f_id_number TEXT,
            total_amount_due DOUBLE PRECISION DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        '''
    )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS customer_entries (
            id SERIAL PRIMARY KEY,
            customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
            customer_code TEXT,
            service_name TEXT,
            start_date TEXT,
            end_date TEXT,
            days INTEGER,
            rate_per_day DOUBLE PRECISION,
            amount_billed DOUBLE PRECISION,
            amount_paid DOUBLE PRECISION DEFAULT 0,
            date_of_payment TEXT,
            date_submitted TEXT,
            denial_codes TEXT,
            is_resubmission BOOLEAN DEFAULT FALSE,
            original_entry_id INTEGER REFERENCES customer_entries(id),
            resubmission_date TEXT,
            billing_comments TEXT,
            batch_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        '''
    )
    # Indexes for fast lookups
    cur.execute('CREATE INDEX IF NOT EXISTS idx_customer_entries_customer_id ON customer_entries(customer_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_customer_entries_start_date ON customer_entries(start_date)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_customers_active_status ON customers(active_status)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_customers_last_name ON customers(lower(last_name))')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_customers_first_name ON customers(lower(first_name))')
    # batch_id index only if column exists
    try:
        cur.execute('CREATE INDEX IF NOT EXISTS idx_customer_entries_batch_id ON customer_entries(batch_id)')
    except Exception:
        pass
    conn.commit()
    conn.close()

def ensure_customers_columns():
    """
    Ensure customers table has the expected columns (migrations for older DBs).
    """
    # columns we expect and their types (sqlite/postgres compatible)
    expected = {
        'date_of_birth': 'TEXT',
        'active_status': "TEXT DEFAULT 'active'",
        'billing_comments': 'TEXT',
        'id_number': 'TEXT',
        'f_id_number': 'TEXT',
        'total_amount_due': 'DOUBLE PRECISION DEFAULT 0',
    }
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Postgres: read information_schema
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'customers'")
        existing = {row['column_name'] for row in cur.fetchall()}
        for col, coltype in expected.items():
            if col not in existing:
                try:
                    cur.execute(f"ALTER TABLE customers ADD COLUMN {col} {coltype}")
                    logger.info(f"Added missing column {col} to customers")
                except Exception:
                    import traceback; traceback.print_exc()
        conn.commit()
    finally:
        conn.close()

def ensure_customer_services_table():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS customer_services (
            id SERIAL PRIMARY KEY,
            customer_id INTEGER REFERENCES customers(id),
            service_name TEXT,
            days INTEGER,
            rate_per_day DOUBLE PRECISION,
            amount_billed DOUBLE PRECISION,
            amount_paid DOUBLE PRECISION,
            date_of_payment TEXT,
            start_date TEXT,
            end_date TEXT,
            created_at TIMESTAMP
        )
        '''
    )
    cur.execute('CREATE INDEX IF NOT EXISTS idx_customer_services_customer_id ON customer_services(customer_id)')
    conn.commit()
    conn.close()


def ensure_customer_services_columns():
    """
    Ensure customer_services table has the expected columns. If the DB was created
    with an older schema, ALTER TABLE to add missing columns.
    """
    expected = {
        'rate_per_day': 'REAL',
        'amount_paid': 'REAL',
        'date_of_payment': 'TEXT',
        'start_date': 'TEXT',
        'end_date': 'TEXT',
    }
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'customer_services'")
        existing = {row['column_name'] for row in cur.fetchall()}
        for col, coltype in expected.items():
            if col not in existing:
                try:
                    # map sqlite types to postgres where appropriate
                    pgtype = 'DOUBLE PRECISION' if col in ('rate_per_day','amount_paid') else 'TEXT'
                    cur.execute(f"ALTER TABLE customer_services ADD COLUMN {col} {pgtype}")
                    logger.info(f"Added missing column {col} to customer_services")
                except Exception:
                    import traceback; traceback.print_exc()
        conn.commit()
    finally:
        conn.close()


def ensure_customer_entries_columns():
    """Add batch_id to customer_entries if missing (for batch-based add/edit)."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'customer_entries'")
        existing = {row['column_name'] for row in cur.fetchall()}
        if 'batch_id' not in existing:
            cur.execute("ALTER TABLE customer_entries ADD COLUMN batch_id TEXT")
            logger.info("Added batch_id to customer_entries")
            conn.commit()
    except Exception as e:
        logger.debug("ensure_customer_entries_columns: %s", e)
    finally:
        conn.close()


def ensure_all_tables():
    """
    Ensures all required tables exist. Call this before any database operation
    to automatically create missing tables.
    """
    try:
        ensure_customers_table()
        ensure_customer_services_table()
        ensure_customer_services_columns()
        ensure_customers_columns()
        ensure_customer_entries_columns()
    except Exception as e:
        logger.error(f"Error ensuring tables: {e}")
        import traceback; traceback.print_exc()


# CSV logging helper
def _ensure_logs_dir():
    # Save logs directly in the backend directory (one level up from routes)
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    try:
        os.makedirs(backend_dir, exist_ok=True)
    except Exception:
        pass
    return backend_dir


def append_activity_log(action: str, customer: dict, service: dict | None, customer_id: int | None, entry_id: int | None, note: str | None = None):
    """
    Append a CSV row describing the customer/entry creation activity.
    Fields: timestamp, action, customer_id, entry_id, customer_code, first_name, last_name, date_of_birth, active_status, service_json, customer_json, note
    """
    try:
        logs_dir = _ensure_logs_dir()
        logfile = os.path.join(logs_dir, 'customer_activity_log.csv')
        write_header = not os.path.exists(logfile)
        with open(logfile, 'a', newline='', encoding='utf-8') as fh:
            writer = csv.writer(fh)
            if write_header:
                writer.writerow([
                    'timestamp', 'action', 'customer_id', 'entry_id', 'customer_code', 'first_name', 'last_name', 'date_of_birth', 'active_status', 'service_json', 'customer_json', 'note'
                ])
            ts = datetime.utcnow().isoformat()
            cust_code = (customer or {}).get('customerCode') if isinstance(customer, dict) else None
            first = (customer or {}).get('firstName') if isinstance(customer, dict) else None
            last = (customer or {}).get('lastName') if isinstance(customer, dict) else None
            dob = (customer or {}).get('dateOfBirth') if isinstance(customer, dict) else None
            active = (customer or {}).get('activeStatus') if isinstance(customer, dict) else None
            service_json = json.dumps(service, ensure_ascii=False) if service else ''
            customer_json = json.dumps(customer, ensure_ascii=False) if customer else ''
            writer.writerow([ts, action, customer_id, entry_id, cust_code, first, last, dob, active, service_json, customer_json, note or ''])
    except Exception:
        # Do not let logging break the API; just log to module logger
        logger.exception('Failed to write activity log')


# NOTE: Table creation (ensure_all_tables) is invoked during application
# startup in `main.py` to avoid opening DB connections at module import time.


@router.post("/", status_code=201)
def create_customer(payload: CreateCustomerPayload, current_user: dict = Depends(get_current_user)):
    # payload expected: { customer: {...}, services: [{...}] } or { customer: {...}, service: {...} }
    import traceback
    data = payload.dict() if hasattr(payload, 'dict') else (payload or {})
    customer = data.get('customer') if isinstance(data, dict) else None
    services_list = data.get('services') if isinstance(data, dict) else None
    single_service = data.get('service') if isinstance(data, dict) else None
    
    # Handle backward compatibility: if no services but has service, convert to services list
    if not services_list and single_service:
        services_list = [single_service]
    
    if not customer:
        raise HTTPException(status_code=400, detail='missing customer')

    conn = get_db_connection()
    cur = conn.cursor()
    created_at = datetime.utcnow().isoformat()
    entry_ids = []
    try:
        # Accept dob from several possible keys sent by frontend
        dob = customer.get('dob') or customer.get('dateOfBirth') or customer.get('date_of_birth')
        # Accept active_status, default to 'active'
        active_status = customer.get('activeStatus') or customer.get('active_status') or 'active'
        id_number = customer.get('idNumber') or customer.get('id_number') or None
        f_id_number = customer.get('fIdNumber') or customer.get('f_id_number') or None

        # Check for duplicate customer by name + DOB first
        first_name = customer.get('firstName')
        last_name = customer.get('lastName')
        
        if first_name and last_name and dob:
            cur.execute(
                'SELECT id FROM customers WHERE LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?) AND date_of_birth = ?',
                (first_name, last_name, dob)
            )
            name_dob_duplicate = cur.fetchone()
            if name_dob_duplicate:
                raise HTTPException(
                    status_code=409, 
                    detail=f"Customer with name '{first_name} {last_name}' and DOB '{dob}' already exists"
                )
        
        # Check if customer already exists by customer_code
        customer_code = customer.get('customerCode')
        cur.execute('SELECT id FROM customers WHERE customer_code = ?', (customer_code,))
        existing_customer = cur.fetchone()
        
        if existing_customer:
            customer_id = existing_customer['id']
        else:
            # Create new customer
            cur.execute(
                'INSERT INTO customers (customer_code, last_name, first_name, date_of_birth, active_status, id_number, f_id_number) VALUES (?,?,?,?,?,?,?) RETURNING id',
                (customer_code, last_name, first_name, dob, active_status, id_number, f_id_number)
            )
            customer_id = cur.fetchone()['id']

        # Create entries for all services.
        # IMPORTANT: We enforce ONE batch_id per customer (canonical batch id).
        if services_list:
            create_batch_id = _get_or_create_canonical_batch_id(cur, customer_id)
            for service in services_list:
                # Convert denial codes to JSON string if it's a list
                denial_codes = service.get('denialCodes')
                if isinstance(denial_codes, list):
                    denial_codes = ','.join(denial_codes) if denial_codes else None
                elif denial_codes == 'null' or denial_codes == '':
                    denial_codes = None
                    
                cur.execute(
                    '''INSERT INTO customer_entries 
                       (customer_id, customer_code, service_name, start_date, end_date, days, rate_per_day, 
                        amount_billed, amount_paid, date_of_payment, date_submitted, denial_codes, billing_comments, batch_id) 
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id''',
                    (
                        customer_id,
                        customer_code,
                        service.get('serviceName'),
                        service.get('startDate') or service.get('start_date'),
                        service.get('endDate') or service.get('end_date'),
                        service.get('days'),
                        service.get('ratePerDay'),
                        service.get('amountBilled'),
                        service.get('amountPaid', 0),
                        service.get('dateOfPayment'),
                        service.get('dateSubmitted'),
                        denial_codes,
                        customer.get('comments'),
                        create_batch_id,
                    )
                )
                entry_id = cur.fetchone()['id']
                entry_ids.append(entry_id)

        conn.commit()
        # Non-fatal: append CSV activity log after successful commit
        try:
            for i, service in enumerate(services_list or []):
                entry_id = entry_ids[i] if i < len(entry_ids) else None
                append_activity_log('create_customer', customer if isinstance(customer, dict) else {}, service if isinstance(service, dict) else None, customer_id if 'customer_id' in locals() else None, entry_id, note='created via API')
        except Exception:
            logger.exception('Failed to append activity log after create_customer')
    except Exception as exc:
        # log full traceback to server console for debugging and return 500
        traceback.print_exc()
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()

    return {
        'id': customer_id,
        'entry_ids': entry_ids,
        'customer_code': customer.get('customerCode'),
        'first_name': customer.get('firstName'),
        'last_name': customer.get('lastName'),
        'date_of_birth': dob,
        'active_status': active_status,
        'id_number': id_number,
        'f_id_number': f_id_number,
    }


@router.get("/")
def list_customers(
    name: Optional[str] = Query(None),
    firstName: Optional[str] = Query(None),
    lastName: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None), 
    end_date: Optional[str] = Query(None),
    dob: Optional[str] = Query(None),
    status: Optional[str] = Query('active', description="Filter by active_status: 'active', 'inactive', or 'all'"),
    current_user: dict = Depends(get_current_user)
):
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Build query based on whether we have date filters or not
    # If we have date filters, we need to join with customer_services to filter by service dates
    if start_date or end_date:
        # Query with JOIN to filter by service start dates
        q = '''
            SELECT DISTINCT c.* FROM customers c
            INNER JOIN customer_services cs ON c.id = cs.customer_id
        '''
        clauses = []
        params = []
        
        # Smart name filter
        if name:
            name_parts = name.strip().split()
            if len(name_parts) == 1:
                clauses.append('(LOWER(c.first_name) LIKE ? OR LOWER(c.last_name) LIKE ?)')
                like = f"%{name_parts[0]}%".lower()
                params.extend([like, like])
            elif len(name_parts) >= 2:
                first_word = name_parts[0].lower()
                last_word = name_parts[-1].lower()
                clauses.append(
                    '((LOWER(c.first_name) LIKE ? AND LOWER(c.last_name) LIKE ?) OR (LOWER(c.first_name) LIKE ? AND LOWER(c.last_name) LIKE ?))'
                )
                params.extend([
                    f'%{first_word}%', f'%{last_word}%',
                    f'%{last_word}%', f'%{first_word}%'
                ])
        
        # Filter by service date range
        if start_date and end_date:
            # Both dates provided - show services where service period is within the range (inclusive)
            # Service period overlaps if it starts on/before end_date AND ends on/after start_date
            clauses.append('(cs.start_date >= ? AND cs.end_date <= ?)')
            params.extend([start_date, end_date])
        elif start_date:
            # Only start date - show services that start on or after this date
            clauses.append('cs.start_date >= ?')
            params.append(start_date)
        elif end_date:
            # Only end date - show services that start on or before this date
            clauses.append('cs.start_date <= ?')
            params.append(end_date)
        
        if clauses:
            q = q + ' WHERE ' + ' AND '.join(clauses)
        # Filter by customer date of birth if provided
        if dob:
            q = q + ((' AND ' if clauses else ' WHERE ') + ' c.date_of_birth = ?')
            params.append(dob)
        # Filter by active status - default to active only, unless 'all' is specified
        if status and status != 'all':
            q = q + ((' AND ' if clauses or dob else ' WHERE ') + ' c.active_status = ?')
            params.append(status)
        q = q + ' ORDER BY c.id DESC LIMIT 500'
    else:
        # No date filters - simple customer query
        q = 'SELECT * FROM customers'
        clauses = []
        params = []
        
        # Name filtering - search in merged name field
        if name:
            merged_name_clause = "(LOWER(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) LIKE ?)"
            clauses.append(merged_name_clause)
            params.append(f"%{name.lower()}%")
        
        # New firstName/lastName filters - search in merged name field
        if firstName or lastName:
            name_conditions = []
            if firstName:
                name_conditions.append("LOWER(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) LIKE ?")
                params.append(f"%{firstName.lower()}%")
            if lastName:
                name_conditions.append("LOWER(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) LIKE ?") 
                params.append(f"%{lastName.lower()}%")
            if name_conditions:
                clauses.append(f"({' AND '.join(name_conditions)})")
        
        if clauses:
            q = q + ' WHERE ' + ' AND '.join(clauses)
        # Filter by customer date of birth if provided
        if dob:
            q = q + ((' AND ' if clauses else ' WHERE ') + ' date_of_birth = ?')
            params.append(dob)
        # Filter by active status - default to active only, unless 'all' is specified
        if status and status != 'all':
            q = q + ((' AND ' if clauses or dob else ' WHERE ') + ' active_status = ?')
            params.append(status)
        q = q + ' ORDER BY id DESC LIMIT 500'
    
    cur.execute(q, params)
    rows = cur.fetchall()

    customers = []
    ids = []
    for r in rows:
        cust = {
            'id': r['id'],
            'customer_code': r['customer_code'],
            'last_name': r['last_name'],
            'first_name': r['first_name'],
            'date_of_birth': r['date_of_birth'] if 'date_of_birth' in r.keys() else None,
            'active_status': r['active_status'] if 'active_status' in r.keys() else 'active',
            'total_amount_due': (r.get('total_amount_due', 0) if isinstance(r, dict) else (r['total_amount_due'] if 'total_amount_due' in r.keys() else 0)),
            'id_number': r.get('id_number'),
            'f_id_number': r.get('f_id_number'),
        }
        customers.append(cust)
        ids.append(r['id'])

    # fetch all service lines for the returned customers
    # If date filters are applied, only return services within that date range
    services_map = {}
    if ids:
        placeholder = ','.join('?' for _ in ids)
        svc_q = f'SELECT * FROM customer_services WHERE customer_id IN ({placeholder})'
        svc_params = list(ids)
        
        # Apply date filters to services if present
        svc_clauses = []
        if start_date:
            svc_clauses.append('start_date >= ?')
            svc_params.append(start_date)
        if end_date:
            svc_clauses.append('start_date <= ?')
            svc_params.append(end_date)
        
        if svc_clauses:
            svc_q = svc_q + ' AND ' + ' AND '.join(svc_clauses)
        
        svc_q = svc_q + ' ORDER BY id'
        cur.execute(svc_q, svc_params)
        svc_rows = cur.fetchall()
        for s in svc_rows:
            cid = s['customer_id']
            services_map.setdefault(cid, []).append({
                'id': s['id'],
                'service_name': s['service_name'],
                'days': s['days'],
                'rate_per_day': s['rate_per_day'],
                'amount_billed': s['amount_billed'],
                'amount_paid': s['amount_paid'],
                'date_of_payment': s['date_of_payment'],
                'start_date': s.get('start_date') if isinstance(s, dict) else s['start_date'],
                'end_date': s.get('end_date') if isinstance(s, dict) else s['end_date'],
                'created_at': s['created_at'],
            })

    # attach services to customers
    for c in customers:
        c['services'] = services_map.get(c['id'], [])

    conn.close()
    return customers


@router.get("/{customer_id}")
def get_customer(customer_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('SELECT * FROM customers WHERE id = ?', (customer_id,))
    r = cur.fetchone()
    if not r:
        conn.close()
        raise HTTPException(status_code=404, detail='not found')
    customer = dict(r)
    cur.execute('SELECT * FROM customer_services WHERE customer_id = ?', (customer_id,))
    svc_rows = cur.fetchall()
    svc = []
    for s in svc_rows:
        d = dict(s)
        # ensure start_date/end_date keys present
        d['start_date'] = s.get('start_date') if isinstance(s, dict) else s['start_date']
        d['end_date'] = s.get('end_date') if isinstance(s, dict) else s['end_date']
        svc.append(d)
    conn.close()
    customer['services'] = svc
    # normalize date_of_birth key for response if missing
    if 'date_of_birth' not in customer:
        customer['date_of_birth'] = None
    # normalize active_status key for response if missing
    if 'active_status' not in customer:
        customer['active_status'] = 'active'
    if 'id_number' not in customer:
        customer['id_number'] = None
    if 'f_id_number' not in customer:
        customer['f_id_number'] = None
    return customer



@router.put("/{customer_id}")
def update_customer(customer_id: int, payload: UpdateCustomerPayload, current_user: dict = Depends(get_current_user)):
    """Update customer and handle service entry updates or resubmissions.
    Payload: { customer: {...}, service: {...}, isResubmission: boolean }
    """
    logger.debug(f"=== UPDATE CUSTOMER {customer_id} ===")
    logger.debug(f"Payload: {payload}")
    
    data = payload.dict() if hasattr(payload, 'dict') else (payload or {})
    customer = data.get('customer') if isinstance(data, dict) else None
    service = data.get('service') if isinstance(data, dict) else None
    is_resubmission = data.get('isResubmission', False)
    
    logger.debug(f"Customer data: {customer}")
    logger.debug(f"Service data: {service}")
    logger.debug(f"Is resubmission: {is_resubmission}")
    
    if not customer:
        raise HTTPException(status_code=400, detail='missing customer payload')

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # ensure customer exists and fetch current values
        cur.execute('SELECT * FROM customers WHERE id = ?', (customer_id,))
        existing = cur.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail='customer not found')

        # Check if we should update customer fields at all
        # If all customer fields are None, skip customer update (only updating service)
        should_update_customer = any([
            customer.get('lastName') is not None,
            customer.get('firstName') is not None,
            customer.get('dateOfBirth') is not None,
            customer.get('dob') is not None,
            customer.get('comments') is not None,
            customer.get('idNumber') is not None,
            customer.get('fIdNumber') is not None,
            customer.get('customerCode') is not None,
        ])
        
        logger.info(f"Should update customer: {should_update_customer}")
        
        if should_update_customer:
            # Update customer basic info
            # Accept dob updates from frontend under common keys
            has_dob_key = 'dob' in customer or 'dateOfBirth' in customer or 'date_of_birth' in customer
            dob_val = None
            if has_dob_key:
                dob_val = customer.get('dob') or customer.get('dateOfBirth') or customer.get('date_of_birth')
            else:
                dob_val = existing.get('date_of_birth') if isinstance(existing, dict) else existing['date_of_birth']

            # Accept active_status updates
            has_active_key = 'activeStatus' in customer or 'active_status' in customer
            if has_active_key:
                active_status_val = customer.get('activeStatus') or customer.get('active_status')
            else:
                active_status_val = existing.get('active_status') if isinstance(existing, dict) else existing['active_status']

            # Only overwrite first/last name/billing_comments if keys provided in payload AND not None
            if 'lastName' in customer and customer.get('lastName') is not None:
                last_name_val = customer.get('lastName')
            else:
                last_name_val = existing.get('last_name') if isinstance(existing, dict) else existing['last_name']

            if 'firstName' in customer and customer.get('firstName') is not None:
                first_name_val = customer.get('firstName')
            else:
                first_name_val = existing.get('first_name') if isinstance(existing, dict) else existing['first_name']

            if 'comments' in customer and customer.get('comments') is not None:
                comments_val = customer.get('comments')
            else:
                # Some older databases may not have billing_comments column; handle that gracefully.
                comments_val = existing.get('billing_comments') if isinstance(existing, dict) and 'billing_comments' in existing else None

            has_id_number = 'idNumber' in customer or 'id_number' in customer
            id_number_val = customer.get('idNumber') or customer.get('id_number') if has_id_number else (existing.get('id_number') if isinstance(existing, dict) else existing.get('id_number'))
            has_f_id_number = 'fIdNumber' in customer or 'f_id_number' in customer
            f_id_number_val = customer.get('fIdNumber') or customer.get('f_id_number') if has_f_id_number else (existing.get('f_id_number') if isinstance(existing, dict) else existing.get('f_id_number'))

            # Update customer record. Some legacy databases may not yet have billing_comments;
            # if the first UPDATE fails due to that column, retry without touching it.
            try:
                cur.execute(
                    'UPDATE customers SET last_name = ?, first_name = ?, billing_comments = ?, date_of_birth = ?, active_status = ?, id_number = ?, f_id_number = ? WHERE id = ?',
                    (
                        last_name_val,
                        first_name_val,
                        comments_val,
                        dob_val,
                        active_status_val,
                        id_number_val,
                        f_id_number_val,
                        customer_id,
                    )
                )
                logger.info("Customer fields updated")
            except Exception as e:
                if 'billing_comments' in str(e):
                    logger.warning("billing_comments column missing on customers; updating without it: %s", e)
                    cur.execute(
                        'UPDATE customers SET last_name = ?, first_name = ?, date_of_birth = ?, active_status = ?, id_number = ?, f_id_number = ? WHERE id = ?',
                        (
                            last_name_val,
                            first_name_val,
                            dob_val,
                            active_status_val,
                            id_number_val,
                            f_id_number_val,
                            customer_id,
                        )
                    )
                else:
                    raise
        else:
            logger.info("Skipping customer update - only updating service")

        entry_id = None
        if service:
            # Get customer_code
            customer_code = existing.get('customer_code') if isinstance(existing, dict) else existing['customer_code']

            # If the caller provides an entry id, update that specific entry instead of creating new.
            # This is important for the "Edit service" action in the table, where each row represents a specific entry.
            target_entry_id = (
                service.get('id')
                or service.get('entryId')
                or service.get('entry_id')
            )
            
            logger.info(f"Service payload: {service}")
            logger.info(f"Target entry ID: {target_entry_id}")
            
            # Convert denial codes to string
            denial_codes = service.get('denialCodes')
            if isinstance(denial_codes, list):
                denial_codes = ','.join(denial_codes) if denial_codes else None
            elif denial_codes == 'null' or denial_codes == '':
                denial_codes = None
                
            if is_resubmission:
                # Create new entry for resubmission
                logger.info("Creating new resubmission entry...")
                cur.execute(
                    '''INSERT INTO customer_entries 
                       (customer_id, customer_code, service_name, start_date, end_date, days, rate_per_day, 
                        amount_billed, amount_paid, date_of_payment, date_submitted, denial_codes, 
                        is_resubmission, original_entry_id, resubmission_date, billing_comments) 
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id''',
                    (
                        customer_id,
                        customer_code,
                        service.get('serviceName'),
                        service.get('startDate') or service.get('start_date'),
                        service.get('endDate') or service.get('end_date'),
                        service.get('days'),
                        service.get('ratePerDay'),
                        service.get('amountBilled'),
                        service.get('amountPaid', 0),
                        service.get('dateOfPayment'),
                        service.get('dateSubmitted'),
                        denial_codes,
                        True,  # is_resubmission
                        target_entry_id,
                        datetime.utcnow().isoformat(),
                        service.get('comments', ''),
                    )
                )
                entry_id = cur.fetchone()['id']
                logger.info(f"Created new entry with ID: {entry_id}")
            else:
                # Update an explicitly targeted entry if possible, otherwise CREATE NEW entry.
                entry_to_update = None
                if target_entry_id:
                    logger.info(f"Looking for entry ID: {target_entry_id}")
                    cur.execute(
                        'SELECT id FROM customer_entries WHERE id = ? AND customer_id = ?',
                        (target_entry_id, customer_id)
                    )
                    found = cur.fetchone()
                    if found:
                        entry_to_update = found['id']
                        logger.info(f"Found entry to update: {entry_to_update}")
                    else:
                        logger.warning(f"Entry ID {target_entry_id} not found")

                # If no specific entry ID provided, this is a NEW service being added
                if not target_entry_id:
                    logger.info("No entry ID provided - creating NEW entry...")
                    cur.execute(
                        '''INSERT INTO customer_entries 
                           (customer_id, customer_code, service_name, start_date, end_date, days, rate_per_day, 
                            amount_billed, amount_paid, date_of_payment, date_submitted, denial_codes, 
                            is_resubmission, billing_comments) 
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id''',
                        (
                            customer_id,
                            customer_code,
                            service.get('serviceName'),
                            service.get('startDate') or service.get('start_date'),
                            service.get('endDate') or service.get('end_date'),
                            service.get('days'),
                            service.get('ratePerDay'),
                            service.get('amountBilled'),
                            service.get('amountPaid', 0),
                            service.get('dateOfPayment'),
                            service.get('dateSubmitted'),
                            denial_codes,
                            False,
                            service.get('comments', ''),
                        )
                    )
                    entry_id = cur.fetchone()['id']
                    logger.info(f"Created NEW entry with ID: {entry_id}")
                elif entry_to_update:
                    # Update existing entry
                    logger.info(f"Updating existing entry ID: {entry_to_update}")
                    cur.execute(
                        '''UPDATE customer_entries 
                           SET service_name = ?, start_date = ?, end_date = ?, days = ?, rate_per_day = ?, 
                               amount_billed = ?, amount_paid = ?, date_of_payment = ?, date_submitted = ?, 
                               denial_codes = ?, is_resubmission = ?, billing_comments = ?, updated_at = CURRENT_TIMESTAMP
                           WHERE id = ?''',
                        (
                            service.get('serviceName'),
                            service.get('startDate') or service.get('start_date'),
                            service.get('endDate') or service.get('end_date'),
                            service.get('days'),
                            service.get('ratePerDay'),
                            service.get('amountBilled'),
                            service.get('amountPaid', 0),
                            service.get('dateOfPayment'),
                            service.get('dateSubmitted'),
                            denial_codes,
                            False,  # is_resubmission
                            service.get('comments', ''),
                            entry_to_update,
                        )
                    )
                    entry_id = entry_to_update
                    logger.info(f"Updated entry ID: {entry_id}")
                else:
                    # Entry ID was provided but not found - create new one
                    logger.warning(f"Entry ID {target_entry_id} not found - creating new entry...")
                    cur.execute(
                        '''INSERT INTO customer_entries 
                           (customer_id, customer_code, service_name, start_date, end_date, days, rate_per_day, 
                            amount_billed, amount_paid, date_of_payment, date_submitted, denial_codes, 
                            is_resubmission, billing_comments) 
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id''',
                        (
                            customer_id,
                            customer_code,
                            service.get('serviceName'),
                            service.get('startDate') or service.get('start_date'),
                            service.get('endDate') or service.get('end_date'),
                            service.get('days'),
                            service.get('ratePerDay'),
                            service.get('amountBilled'),
                            service.get('amountPaid', 0),
                            service.get('dateOfPayment'),
                            service.get('dateSubmitted'),
                            denial_codes,
                            False,  # is_resubmission
                            service.get('comments', ''),
                        )
                    )
                    entry_id = cur.fetchone()['id']
                    logger.info(f"Created new entry with ID: {entry_id}")
        
        conn.commit()
    finally:
        conn.close()

    return { 
        'id': customer_id, 
        'entry_id': entry_id,
        'updated': True,
        'is_resubmission': is_resubmission
    }


@router.put("/{customer_id}/services/{service_id}")
def update_customer_service(customer_id: int, service_id: int, payload: ServiceWrapper, current_user: dict = Depends(get_current_user)):
    """Update a service line for a customer. Payload: { service: { serviceName, days, ratePerDay, amountBilled, amountPaid, dateOfPayment } }
    """
    data = payload.dict() if hasattr(payload, 'dict') else (payload or {})
    service = data.get('service') if isinstance(data, dict) else None
    if not service:
        raise HTTPException(status_code=400, detail='missing service payload')

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Prefer updating the new `customer_entries` table when the id exists there.
        # Fall back to legacy `customer_services` for older records / older UIs.
        cur.execute('SELECT id FROM customer_entries WHERE id = ? AND customer_id = ?', (service_id, customer_id))
        entry_row = cur.fetchone()
        if entry_row:
            # Preserve existing optional fields when not provided
            cur.execute('SELECT denial_codes, date_submitted FROM customer_entries WHERE id = ? AND customer_id = ?', (service_id, customer_id))
            existing_entry = cur.fetchone() or {}

            denial_codes_val = None
            if isinstance(service, dict) and 'denialCodes' in service:
                denial_codes_val = service.get('denialCodes')
                if isinstance(denial_codes_val, list):
                    denial_codes_val = ','.join(denial_codes_val) if denial_codes_val else None
                elif denial_codes_val == 'null' or denial_codes_val == '':
                    denial_codes_val = None
            else:
                denial_codes_val = existing_entry.get('denial_codes') if isinstance(existing_entry, dict) else None

            date_submitted_val = service.get('dateSubmitted') if (isinstance(service, dict) and 'dateSubmitted' in service) else (
                existing_entry.get('date_submitted') if isinstance(existing_entry, dict) else None
            )

            cur.execute(
                '''UPDATE customer_entries
                   SET service_name = ?, start_date = ?, end_date = ?, days = ?, rate_per_day = ?,
                       amount_billed = ?, amount_paid = ?, date_of_payment = ?, date_submitted = ?,
                       denial_codes = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?''',
                (
                    service.get('serviceName'),
                    service.get('startDate') or service.get('start_date'),
                    service.get('endDate') or service.get('end_date'),
                    service.get('days'),
                    service.get('ratePerDay'),
                    service.get('amountBilled'),
                    service.get('amountPaid'),
                    service.get('dateOfPayment'),
                    date_submitted_val,
                    denial_codes_val,
                    service_id,
                )
            )
        else:
            cur.execute('SELECT id FROM customer_services WHERE id = ? AND customer_id = ?', (service_id, customer_id))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail='service line not found')

            cur.execute(
                'UPDATE customer_services SET service_name = ?, days = ?, rate_per_day = ?, amount_billed = ?, amount_paid = ?, date_of_payment = ?, start_date = ?, end_date = ? WHERE id = ?',
                (
                    service.get('serviceName'),
                    service.get('days'),
                    service.get('ratePerDay'),
                    service.get('amountBilled'),
                    service.get('amountPaid'),
                    service.get('dateOfPayment'),
                    service.get('startDate') or service.get('start_date'),
                    service.get('endDate') or service.get('end_date'),
                    service_id,
                )
            )
            # recompute customer's total_amount_due after update (if column exists)
            cur.execute('SELECT customer_id FROM customer_services WHERE id = ?', (service_id,))
            row = cur.fetchone()
            cid = row['customer_id'] if row else customer_id
            cur.execute('SELECT COALESCE(SUM(amount_billed),0) as total FROM customer_services WHERE customer_id = ?', (cid,))
            total = cur.fetchone()['total']
            try:
                cur.execute('UPDATE customers SET total_amount_due = ? WHERE id = ?', (total, cid))
            except Exception as e:
                if 'total_amount_due' in str(e) or 'UndefinedColumn' in type(e).__name__:
                    logger.debug("Skipping total_amount_due update (column may not exist): %s", e)
                else:
                    raise
        conn.commit()
    finally:
        conn.close()

    return { 'id': service_id, 'updated': True }


@router.delete("/{customer_id}/services/{service_id}", status_code=200)
def delete_customer_service(customer_id: int, service_id: int, current_user: dict = Depends(get_current_user)):
    """Delete a specific service entry for a customer."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Try customer_entries first (primary table)
        cur.execute('SELECT id FROM customer_entries WHERE id = ? AND customer_id = ?', (service_id, customer_id))
        entry_row = cur.fetchone()
        if entry_row:
            cur.execute('DELETE FROM customer_entries WHERE id = ? AND customer_id = ?', (service_id, customer_id))
            logger.info(f"Deleted customer_entries row {service_id} for customer {customer_id}")
        else:
            # Fall back to legacy customer_services table
            cur.execute('SELECT id FROM customer_services WHERE id = ? AND customer_id = ?', (service_id, customer_id))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail='service not found')
            cur.execute('DELETE FROM customer_services WHERE id = ? AND customer_id = ?', (service_id, customer_id))
            logger.info(f"Deleted customer_services row {service_id} for customer {customer_id}")

        # Update total_amount_due
        try:
            cur.execute('SELECT COALESCE(SUM(amount_billed),0) as total FROM customer_entries WHERE customer_id = %s', (customer_id,))
            total = cur.fetchone()['total']
            cur.execute('UPDATE customers SET total_amount_due = %s WHERE id = %s', (total, customer_id))
        except Exception as e:
            logger.debug(f"Skipping total_amount_due update: {e}")

        conn.commit()
    except HTTPException:
        raise
    except Exception as exc:
        conn.rollback()
        logger.error(f"Failed to delete service {service_id}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()

    return {'id': service_id, 'deleted': True}


@router.post("/{customer_id}/services", status_code=201)
def add_customer_service(customer_id: int, payload: ServiceWrapper, current_user: dict = Depends(get_current_user)):
    """Add a new service line for an existing customer.
    Payload: { service: { serviceName, days, ratePerDay, amountBilled, amountPaid, dateOfPayment } }
    Returns the created service row.
    """
    logger.info(f"=== ADD SERVICE for customer {customer_id} ===")
    logger.debug(f"Payload received: {payload}")
    
    data = payload.dict() if hasattr(payload, 'dict') else (payload or {})
    service = data.get('service') if isinstance(data, dict) else None
    if not service:
        logger.error("Missing service payload")
        raise HTTPException(status_code=400, detail='missing service payload')

    logger.debug(f"Service data: {service}")

    conn = get_db_connection()
    cur = conn.cursor()
    created_at = datetime.utcnow().isoformat()
    try:
        # ensure customer exists + get customer_code for entry rows
        cur.execute('SELECT id, customer_code FROM customers WHERE id = ?', (customer_id,))
        cust_row = cur.fetchone()
        if not cust_row:
            logger.error(f"Customer {customer_id} not found")
            raise HTTPException(status_code=404, detail='customer not found')
        customer_code = cust_row.get('customer_code') if isinstance(cust_row, dict) else cust_row['customer_code']
        logger.info(f"Found customer: {customer_code}")

        # Determine batch_id to use.
        # We enforce ONE canonical batch_id per customer.
        batch_id_to_use = None
        try:
            incoming_batch_id = None
            if isinstance(service, dict):
                incoming_batch_id = service.get('batchId') or service.get('batch_id')
            if incoming_batch_id and isinstance(incoming_batch_id, str) and incoming_batch_id.startswith('legacy-'):
                legacy_id_str = incoming_batch_id.replace('legacy-', '', 1)
                legacy_entry_id = int(legacy_id_str)
                cur.execute(
                    'SELECT batch_id FROM customer_entries WHERE id = ? AND customer_id = ?',
                    (legacy_entry_id, customer_id)
                )
                legacy_row = cur.fetchone()
                existing_batch = legacy_row.get('batch_id') if isinstance(legacy_row, dict) else (legacy_row['batch_id'] if legacy_row else None)
                # Upgrade legacy entry to canonical batch id (single batch per customer).
                canonical = _get_or_create_canonical_batch_id(cur, customer_id)
                if not existing_batch or str(existing_batch) != str(canonical):
                    cur.execute(
                        'UPDATE customer_entries SET batch_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND customer_id = ?',
                        (canonical, legacy_entry_id, customer_id)
                    )
                batch_id_to_use = canonical
            else:
                # Ignore differing incoming batch ids; always use canonical.
                batch_id_to_use = _get_or_create_canonical_batch_id(cur, customer_id)
        except Exception as e:
            logger.debug("add_customer_service: failed to determine batch_id: %s", e)
            batch_id_to_use = None

        if not batch_id_to_use:
            batch_id_to_use = _get_or_create_canonical_batch_id(cur, customer_id)

        denial_codes_val = service.get('denialCodes')
        if isinstance(denial_codes_val, list):
            denial_codes_val = ','.join(denial_codes_val) if denial_codes_val else None
        elif denial_codes_val == 'null' or denial_codes_val == '':
            denial_codes_val = None

        logger.info(f"Inserting entry into customer_entries table...")
        # Insert into the primary `customer_entries` table so the main table view (entries/all)
        # immediately reflects the new service line.
        cur.execute(
            '''INSERT INTO customer_entries
               (customer_id, customer_code, service_name, start_date, end_date, days, rate_per_day,
                amount_billed, amount_paid, date_of_payment, date_submitted, denial_codes, is_resubmission, billing_comments, batch_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id''',
            (
                customer_id,
                customer_code,
                service.get('serviceName'),
                service.get('startDate') or service.get('start_date') or None,
                service.get('endDate') or service.get('end_date') or None,
                service.get('days'),
                service.get('ratePerDay'),
                service.get('amountBilled'),
                service.get('amountPaid', 0),
                service.get('dateOfPayment'),
                service.get('dateSubmitted'),
                denial_codes_val,
                False,
                service.get('comments') if isinstance(service, dict) else '',
                batch_id_to_use,
            )
        )
        entry_id = cur.fetchone()['id']
        logger.info(f"Entry created with id: {entry_id}")

        # Also insert into legacy `customer_services` for backward compatibility with older endpoints.
        legacy_service_id = None
        try:
            cur.execute(
                'INSERT INTO customer_services (customer_id, service_name, days, rate_per_day, amount_billed, amount_paid, date_of_payment, start_date, end_date, created_at) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id',
                (
                    customer_id,
                    service.get('serviceName'),
                    service.get('days'),
                    service.get('ratePerDay'),
                    service.get('amountBilled'),
                    service.get('amountPaid'),
                    service.get('dateOfPayment'),
                    service.get('startDate') or service.get('start_date') or None,
                    service.get('endDate') or service.get('end_date') or None,
                    created_at,
                )
            )
            legacy_service_id = cur.fetchone()['id']
            logger.debug(f"Legacy service created with id: {legacy_service_id}")
        except Exception as e:
            logger.debug("Skipping legacy customer_services insert: %s", e)

        # Legacy: recompute customer's total_amount_due if column exists
        # Note: This column may not exist in all database schemas
        # Skipping this update is non-critical - it's just a cached sum
        try:
            cur.execute('SELECT COALESCE(SUM(amount_billed),0) as total FROM customer_services WHERE customer_id = %s', (customer_id,))
            total_result = cur.fetchone()
            if total_result:
                total = total_result['total']
                cur.execute('UPDATE customers SET total_amount_due = %s WHERE id = %s', (total, customer_id))
                logger.debug(f"Updated total_amount_due to {total}")
        except Exception as e:
            # Column might not exist or be in different schema - this is non-critical
            logger.debug(f"Skipping total_amount_due update: {e}")

        logger.info("Committing transaction...")
        conn.commit()
        logger.info("Transaction committed successfully!")
    except Exception as exc:
        conn.rollback()
        logger.error(f"Failed to add service: {exc}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()

    return {
        # Keep `id` for backwards compatibility (now points to the entry id used by the main table)
        'id': entry_id,
        'entry_id': entry_id,
        'legacy_service_id': legacy_service_id,
        'customer_id': customer_id,
        'service_name': service.get('serviceName'),
        'amount_billed': service.get('amountBilled'),
    }


@router.delete("/", status_code=200)
def delete_all_customers(current_user: dict = Depends(get_current_user)):
    """
    Delete ALL customers and their service lines. This is destructive — use with caution.
    Returns counts of rows deleted for customers and customer_services.
    """
    # Ensure tables exist so the operation is safe even on a fresh DB
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Get counts before deletion for reporting
        cur.execute('SELECT COUNT(*) AS cnt FROM customer_services')
        row = cur.fetchone()
        services_before = row['cnt'] if row else 0

        cur.execute('SELECT COUNT(*) AS cnt FROM customers')
        row = cur.fetchone()
        customers_before = row['cnt'] if row else 0

        # Delete child rows first (customer_services) then parents (customers)
        cur.execute('DELETE FROM customer_services')
        cur.execute('DELETE FROM customers')
        conn.commit()
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete customers: {exc}")
    finally:
        conn.close()

    return { 'deleted': True, 'customers_deleted': customers_before, 'services_deleted': services_before }


@router.get("/{customer_id}/entries")
def get_customer_entries(customer_id: int, current_user: dict = Depends(get_current_user)):
    """Get all entries/submissions for a specific customer"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Get customer info
        cur.execute('SELECT * FROM customers WHERE id = ?', (customer_id,))
        customer = cur.fetchone()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Get all entries for this customer
        cur.execute(
            '''SELECT * FROM customer_entries 
               WHERE customer_id = ? 
               ORDER BY created_at DESC''', 
            (customer_id,)
        )
        entries = cur.fetchall()
        
        # Convert to dict and parse denial_codes
        entries_list = []
        for entry in entries:
            entry_dict = dict(entry)
            if entry_dict['denial_codes']:
                entry_dict['denial_codes'] = entry_dict['denial_codes'].split(',')
            else:
                entry_dict['denial_codes'] = []
            entries_list.append(entry_dict)
            
        return {
            'customer': dict(customer),
            'entries': entries_list,
            'total_entries': len(entries_list)
        }
    finally:
        conn.close()


# ---------- Batch-based Add/Edit (customer_entries.batch_id) ----------

@router.get("/{customer_id}/batches")
def list_customer_batches(customer_id: int, current_user: dict = Depends(get_current_user)):
    """List batches for a customer. Each batch has one batch_id and N entries. Legacy rows (no batch_id) appear as one batch per row."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute('SELECT id FROM customers WHERE id = ?', (customer_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail='customer not found')
        cur.execute(
            'SELECT id, batch_id, created_at FROM customer_entries WHERE customer_id = ? ORDER BY created_at',
            (customer_id,)
        )
        rows = cur.fetchall()
        # Group by batch_id; NULL batch_id => one batch per row (legacy) with synthetic id
        batches_map = {}
        for r in rows:
            bid = r.get('batch_id') if isinstance(r, dict) else r['batch_id']
            if bid is None or bid == '':
                bid = f"legacy-{r.get('id') if isinstance(r, dict) else r['id']}"
            created = r.get('created_at') if isinstance(r, dict) else r['created_at']
            entry_id = r.get('id') if isinstance(r, dict) else r['id']
            if bid not in batches_map:
                batches_map[bid] = {'batch_id': bid, 'entry_count': 0, 'created_at': created, 'entry_ids': []}
            batches_map[bid]['entry_count'] += 1
            batches_map[bid]['entry_ids'].append(entry_id)
        return {'batches': list(batches_map.values())}
    finally:
        conn.close()


@router.get("/{customer_id}/batches/{batch_id}/entries")
def get_batch_entries(customer_id: int, batch_id: str, current_user: dict = Depends(get_current_user)):
    """Fetch only entries for this batch. Edit form uses this (do not fetch all services)."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute('SELECT id FROM customers WHERE id = ?', (customer_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail='customer not found')
        if batch_id.startswith('legacy-'):
            try:
                entry_id = int(batch_id.replace('legacy-', '', 1))
            except ValueError:
                raise HTTPException(status_code=404, detail='invalid batch_id')
            cur.execute('SELECT * FROM customer_entries WHERE id = ? AND customer_id = ?', (entry_id, customer_id))
        else:
            cur.execute(
                'SELECT * FROM customer_entries WHERE customer_id = ? AND batch_id = ? ORDER BY id',
                (customer_id, batch_id)
            )
        rows = cur.fetchall()
        entries_list = []
        for entry in rows:
            d = dict(entry)
            if d.get('denial_codes'):
                d['denial_codes'] = d['denial_codes'].split(',')
            else:
                d['denial_codes'] = []
            entries_list.append(d)
        return {'batch_id': batch_id, 'customer_id': customer_id, 'entries': entries_list}
    finally:
        conn.close()


@router.post("/{customer_id}/batches", status_code=201)
def create_batch(customer_id: int, payload: BatchCreatePayload, current_user: dict = Depends(get_current_user)):
    """Add N services as one batch: one batch_id (UUID), N rows. Never combine with other batches."""
    data = payload.dict() if hasattr(payload, 'dict') else (payload or {})
    services_list = data.get('services') or []
    if not services_list:
        raise HTTPException(status_code=400, detail='at least one service required')
    batch_id = str(uuid.uuid4())
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute('SELECT id, customer_code FROM customers WHERE id = ?', (customer_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail='customer not found')
        customer_code = row.get('customer_code') if isinstance(row, dict) else row['customer_code'] or ''
        entry_ids = []
        for svc in services_list:
            denial_codes_val = svc.get('denialCodes') if isinstance(svc, dict) else None
            if isinstance(denial_codes_val, list):
                denial_codes_val = ','.join(denial_codes_val) if denial_codes_val else None
            elif denial_codes_val in ('null', '', None):
                denial_codes_val = None
            cur.execute(
                '''INSERT INTO customer_entries
                   (customer_id, customer_code, service_name, start_date, end_date, days, rate_per_day,
                    amount_billed, amount_paid, date_of_payment, date_submitted, denial_codes, batch_id)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id''',
                (
                    customer_id,
                    customer_code,
                    svc.get('serviceName'),
                    svc.get('startDate') or svc.get('start_date'),
                    svc.get('endDate') or svc.get('end_date'),
                    svc.get('days'),
                    svc.get('ratePerDay'),
                    svc.get('amountBilled'),
                    svc.get('amountPaid', 0),
                    svc.get('dateOfPayment'),
                    svc.get('dateSubmitted'),
                    denial_codes_val,
                    batch_id,
                )
            )
            entry_ids.append(cur.fetchone()['id'])
        conn.commit()
        return {'batch_id': batch_id, 'customer_id': customer_id, 'entry_ids': entry_ids, 'entry_count': len(entry_ids)}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.exception("create_batch failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.put("/{customer_id}/batches/{batch_id}")
def update_batch(customer_id: int, batch_id: str, payload: BatchUpdatePayload, current_user: dict = Depends(get_current_user)):
    """Update only entries in this batch (by id). Do not touch other batches."""
    data = payload.dict() if hasattr(payload, 'dict') else (payload or {})
    services_list = data.get('services') or []
    if not services_list:
        raise HTTPException(status_code=400, detail='at least one service required')
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute('SELECT id FROM customers WHERE id = ?', (customer_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail='customer not found')
        if batch_id.startswith('legacy-'):
            try:
                entry_id = int(batch_id.replace('legacy-', '', 1))
            except ValueError:
                raise HTTPException(status_code=404, detail='invalid batch_id')
            allowed_ids = [entry_id]
            cur.execute('SELECT id FROM customer_entries WHERE id = ? AND customer_id = ?', (entry_id, customer_id))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail='batch not found')
        else:
            cur.execute(
                'SELECT id FROM customer_entries WHERE customer_id = ? AND batch_id = ? ORDER BY id',
                (customer_id, batch_id)
            )
            allowed_ids = [r['id'] for r in cur.fetchall()]
            if not allowed_ids:
                raise HTTPException(status_code=404, detail='batch not found')
        # Map payload services by id; update only allowed ids
        for svc in services_list:
            sid = svc.get('id') or svc.get('entryId') or svc.get('entry_id')
            if sid is None:
                continue
            sid = int(sid)
            if sid not in allowed_ids:
                logger.warning("update_batch: skipping id %s not in batch", sid)
                continue
            denial_codes_val = svc.get('denialCodes')
            if isinstance(denial_codes_val, list):
                denial_codes_val = ','.join(denial_codes_val) if denial_codes_val else None
            elif denial_codes_val in ('null', '', None):
                denial_codes_val = None
            cur.execute(
                '''UPDATE customer_entries SET
                   service_name = ?, start_date = ?, end_date = ?, days = ?, rate_per_day = ?,
                   amount_billed = ?, amount_paid = ?, date_of_payment = ?, date_submitted = ?, denial_codes = ?,
                   updated_at = CURRENT_TIMESTAMP
                   WHERE id = ? AND customer_id = ?''',
                (
                    svc.get('serviceName'),
                    svc.get('startDate') or svc.get('start_date'),
                    svc.get('endDate') or svc.get('end_date'),
                    svc.get('days'),
                    svc.get('ratePerDay'),
                    svc.get('amountBilled'),
                    svc.get('amountPaid', 0),
                    svc.get('dateOfPayment'),
                    svc.get('dateSubmitted'),
                    denial_codes_val,
                    sid,
                    customer_id,
                )
            )
        conn.commit()
        return {'batch_id': batch_id, 'customer_id': customer_id, 'updated': True}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.exception("update_batch failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/{customer_id}/entries", status_code=201)
def add_customer_entry(customer_id: int, payload: ServiceWrapper, current_user: dict = Depends(get_current_user)):
    """Add a new entry/service for an existing customer.
    Payload: { service: { serviceName, days, ratePerDay, amountBilled, amountPaid, dateOfPayment, startDate, endDate, dateSubmitted, denialCodes, comments } }
    Returns the created entry.
    """
    logger.info(f"=== ADD ENTRY for customer {customer_id} ===")
    logger.debug(f"Payload received: {payload}")
    
    data = payload.dict() if hasattr(payload, 'dict') else (payload or {})
    service = data.get('service') if isinstance(data, dict) else None
    if not service:
        logger.error("Missing service payload")
        raise HTTPException(status_code=400, detail='missing service payload')

    logger.debug(f"Service data: {service}")

    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Ensure customer exists and get customer_code
        cur.execute('SELECT id, customer_code FROM customers WHERE id = ?', (customer_id,))
        cust_row = cur.fetchone()
        if not cust_row:
            logger.error(f"Customer {customer_id} not found")
            raise HTTPException(status_code=404, detail='customer not found')
        customer_code = cust_row.get('customer_code') if isinstance(cust_row, dict) else cust_row['customer_code']
        logger.info(f"Found customer: {customer_code}")

        # Handle denial codes
        denial_codes_val = service.get('denialCodes')
        if isinstance(denial_codes_val, list):
            denial_codes_val = ','.join(denial_codes_val) if denial_codes_val else None
        elif denial_codes_val == 'null' or denial_codes_val == '':
            denial_codes_val = None

        logger.info(f"Inserting entry into customer_entries table...")
        # Insert into customer_entries table
        cur.execute(
            '''INSERT INTO customer_entries
               (customer_id, customer_code, service_name, start_date, end_date, days, rate_per_day,
                amount_billed, amount_paid, date_of_payment, date_submitted, denial_codes, is_resubmission, billing_comments)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id''',
            (
                customer_id,
                customer_code,
                service.get('serviceName'),
                service.get('startDate') or service.get('start_date'),
                service.get('endDate') or service.get('end_date'),
                service.get('days'),
                service.get('ratePerDay'),
                service.get('amountBilled'),
                service.get('amountPaid', 0),
                service.get('dateOfPayment'),
                service.get('dateSubmitted'),
                denial_codes_val,
                False,
                service.get('comments', ''),
            )
        )
        entry_id = cur.fetchone()['id']
        logger.info(f"Entry created with id: {entry_id}")

        # Also insert into legacy customer_services for backward compatibility
        try:
            cur.execute(
                '''INSERT INTO customer_services 
                   (customer_id, service_name, days, rate_per_day, amount_billed, amount_paid, 
                    date_of_payment, start_date, end_date, created_at) 
                   VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id''',
                (
                    customer_id,
                    service.get('serviceName'),
                    service.get('days'),
                    service.get('ratePerDay'),
                    service.get('amountBilled'),
                    service.get('amountPaid'),
                    service.get('dateOfPayment'),
                    service.get('startDate') or service.get('start_date'),
                    service.get('endDate') or service.get('end_date'),
                    datetime.utcnow().isoformat(),
                )
            )
            logger.debug("Legacy customer_services entry created")
        except Exception as e:
            logger.debug("Skipping legacy customer_services insert: %s", e)

        # Commit the transaction
        logger.info("Committing transaction...")
        conn.commit()
        logger.info("Transaction committed successfully!")
        
        # Log activity
        try:
            append_activity_log(
                'add_entry', 
                {'customerCode': customer_code}, 
                service, 
                customer_id, 
                entry_id, 
                note='added via /entries endpoint'
            )
        except Exception:
            logger.exception('Failed to append activity log')
        
        return {
            'id': entry_id,
            'customer_id': customer_id,
            'customer_code': customer_code,
            'service_name': service.get('serviceName'),
            'start_date': service.get('startDate') or service.get('start_date'),
            'end_date': service.get('endDate') or service.get('end_date'),
            'days': service.get('days'),
            'rate_per_day': service.get('ratePerDay'),
            'amount_billed': service.get('amountBilled'),
            'amount_paid': service.get('amountPaid', 0),
            'date_of_payment': service.get('dateOfPayment'),
            'date_submitted': service.get('dateSubmitted'),
            'denial_codes': denial_codes_val.split(',') if denial_codes_val else [],
            'billing_comments': service.get('comments', ''),
        }
    except Exception as exc:
        conn.rollback()
        logger.error(f"Failed to add entry: {exc}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()


@router.post("/{customer_id}/resubmit")
def create_resubmission(customer_id: int, payload: ResubmissionPayload, current_user: dict = Depends(get_current_user)):
    """Create a resubmission for an existing customer entry"""
    logger.info(f"Creating resubmission for customer {customer_id}")
    logger.debug(f"Received payload: {payload}")
    
    data = payload.dict() if hasattr(payload, 'dict') else (payload or {})
    original_entry_id = data.get('originalEntryId')
    service = data.get('service', {})
    
    if not original_entry_id:
        raise HTTPException(status_code=400, detail="originalEntryId is required for resubmission")
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Verify original entry exists and belongs to this customer
        cur.execute(
            'SELECT * FROM customer_entries WHERE id = ? AND customer_id = ?', 
            (original_entry_id, customer_id)
        )
        original_entry = cur.fetchone()
        if not original_entry:
            raise HTTPException(status_code=404, detail="Original entry not found")
        
        # Get customer info
        cur.execute('SELECT customer_code FROM customers WHERE id = ?', (customer_id,))
        customer = cur.fetchone()
        
        # Convert denial codes to string
        denial_codes = service.get('denialCodes')
        if isinstance(denial_codes, list):
            denial_codes = ','.join(denial_codes) if denial_codes else None
        elif denial_codes == 'null' or denial_codes == '':
            denial_codes = None
            
        # Create resubmission entry
        cur.execute(
            '''INSERT INTO customer_entries 
               (customer_id, customer_code, service_name, start_date, end_date, days, rate_per_day, 
                amount_billed, amount_paid, date_of_payment, date_submitted, denial_codes, 
                is_resubmission, original_entry_id, resubmission_date, billing_comments) 
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id''',
            (
                customer_id,
                customer['customer_code'],
                service.get('serviceName') or original_entry['service_name'],
                service.get('startDate') or original_entry['start_date'],
                service.get('endDate') or original_entry['end_date'],
                service.get('days') or original_entry['days'],
                service.get('ratePerDay') or original_entry['rate_per_day'],
                service.get('amountBilled') or original_entry['amount_billed'],
                service.get('amountPaid', 0),
                service.get('dateOfPayment'),
                service.get('dateSubmitted'),
                denial_codes,
                True,  # is_resubmission
                original_entry_id,
                datetime.utcnow().isoformat(),
                service.get('comments', ''),
            )
        )
        entry_id = cur.fetchone()['id']
        conn.commit()
        
        return {
            'id': entry_id,
            'customer_id': customer_id,
            'original_entry_id': original_entry_id,
            'is_resubmission': True,
            'resubmission_date': datetime.utcnow().isoformat()
        }
    except Exception as exc:
        conn.rollback()
        logger.error(f"Resubmission failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()


def migrate_customer_service_to_entry(customer_row):
    """Migrate customer service data to customer_entries table"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Insert into customer_entries from customer_services data
        insert_query = '''
            INSERT INTO customer_entries (
                customer_id, service_name, start_date, end_date, days,
                rate_per_day, amount_billed, amount_paid, date_of_payment,
                created_at, is_resubmission
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, FALSE)
            RETURNING id
        '''
        
        cur.execute(insert_query, (
            customer_row['id'],
            customer_row['service_name'],
            customer_row['start_date'],
            customer_row['end_date'],
            customer_row['days'],
            customer_row['rate_per_day'],
            customer_row['amount_billed'],
            customer_row['amount_paid'],
            customer_row['date_of_payment'],
            customer_row.get('entry_created_at') or customer_row['created_at']
        ))
        
        entry_id = cur.fetchone()[0]
        conn.commit()
        conn.close()
        
        logger.info(f"Migrated customer {customer_row['id']} service to entry {entry_id}")
        return entry_id
        
    except Exception as e:
        logger.error(f"Error migrating customer service: {e}")
        conn.close()
        return None


@router.get("/entries/all")
def get_all_entries(
    name: Optional[str] = Query(None),
    firstName: Optional[str] = Query(None),
    lastName: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None), 
    end_date: Optional[str] = Query(None),
    dob: Optional[str] = Query(None),
    status: Optional[str] = Query('active', description="Filter by active_status: 'active', 'inactive', or 'all'"),
    current_user: dict = Depends(get_current_user)
):
    """Get **all** service entries for each customer (one row per entry)."""
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        # Base query to get all entries per customer
        query = '''
            SELECT c.*,
                   e.id as entry_id,
                   e.batch_id,
                   e.service_name,
                   e.start_date,
                   e.end_date,
                   e.days,
                   e.rate_per_day,
                   e.amount_billed,
                   e.amount_paid,
                   e.date_of_payment,
                   e.date_submitted,
                   e.denial_codes,
                   e.is_resubmission,
                   e.created_at as entry_created_at
            FROM customers c
            LEFT JOIN customer_entries e ON e.customer_id = c.id
        '''

        clauses = []
        params: list[Any] = []  # type: ignore[name-defined]

        # Filter by customer status
        if status != 'all':
            clauses.append('c.active_status = ?')
            params.append(status)

        # Name filtering - search in merged name field
        if name:
            merged_name_clause = "(LOWER(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) LIKE ?)"
            clauses.append(merged_name_clause)
            params.append(f"%{name.lower()}%")

        # New firstName/lastName filters - search in merged name field
        if firstName or lastName:
            name_conditions = []
            if firstName:
                name_conditions.append("LOWER(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) LIKE ?")
                params.append(f"%{firstName.lower()}%")
            if lastName:
                name_conditions.append("LOWER(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) LIKE ?")
                params.append(f"%{lastName.lower()}%")
            if name_conditions:
                clauses.append(f"({' AND '.join(name_conditions)})")

        # Date filters (apply to entry dates)
        if start_date or end_date:
            if start_date and end_date:
                clauses.append('(e.start_date >= ? AND e.end_date <= ?)')
                params.extend([start_date, end_date])
            elif start_date:
                clauses.append('e.start_date >= ?')
                params.append(start_date)
            elif end_date:
                clauses.append('e.start_date <= ?')
                params.append(end_date)

        # DOB filter
        if dob:
            clauses.append('c.date_of_birth = ?')
            params.append(dob)

        if clauses:
            query += ' WHERE ' + ' AND '.join(clauses)

        # Sort by customer then by entry creation time
        query += ' ORDER BY c.last_name, c.first_name, e.created_at'

        cur.execute(query, params)
        rows = cur.fetchall()

        entries = []
        for row in rows:
            entry = dict(row)

            # If this row has legacy service data but no entry_id, migrate it once
            if entry.get('entry_id') is None and entry.get('service_name'):
                logger.info(f"Creating entry for customer {entry['id']} from legacy data (all entries view)")
                entry_id = migrate_customer_service_to_entry(entry)
                entry['entry_id'] = entry_id

            # Expose batch_id for batch-level edit; legacy rows get synthetic batch_id
            if entry.get('batch_id') is None or entry.get('batch_id') == '':
                entry['batch_id'] = f"legacy-{entry.get('entry_id')}" if entry.get('entry_id') else None

            # Parse denial codes
            if entry.get('denial_codes'):
                entry['denial_codes'] = entry['denial_codes'].split(',')
            else:
                entry['denial_codes'] = []

            # Calculate due amount
            amount_billed = entry.get('amount_billed', 0) or 0
            amount_paid = entry.get('amount_paid', 0) or 0
            entry['due'] = amount_billed - amount_paid

            entries.append(entry)

        return entries

    finally:
        conn.close()


@router.get("/entries/latest")
def get_latest_entries(
    name: Optional[str] = Query(None),
    firstName: Optional[str] = Query(None),
    lastName: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None), 
    end_date: Optional[str] = Query(None),
    dob: Optional[str] = Query(None),
    status: Optional[str] = Query('active', description="Filter by active_status: 'active', 'inactive', or 'all'"),
    current_user: dict = Depends(get_current_user)
):
    """Get the latest entry for each customer (for main table display)"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Base query to get latest entry per customer
        # If no entries exist, try to get from customer_services (legacy table)
        query = '''
            SELECT c.*, 
                   COALESCE(e.id, cs.id) as entry_id,
                   COALESCE(e.service_name, cs.service_name) as service_name,
                   COALESCE(e.start_date, cs.start_date) as start_date,
                   COALESCE(e.end_date, cs.end_date) as end_date,
                   COALESCE(e.days, cs.days) as days,
                   COALESCE(e.rate_per_day, cs.rate_per_day) as rate_per_day,
                   COALESCE(e.amount_billed, cs.amount_billed) as amount_billed,
                   COALESCE(e.amount_paid, cs.amount_paid) as amount_paid,
                   COALESCE(e.date_of_payment, cs.date_of_payment) as date_of_payment,
                   COALESCE(e.date_submitted, NULL) as date_submitted,
                   COALESCE(e.denial_codes, NULL) as denial_codes,
                   COALESCE(e.is_resubmission, FALSE) as is_resubmission,
                   COALESCE(e.created_at, cs.created_at) as entry_created_at
            FROM customers c
            LEFT JOIN (
                SELECT DISTINCT ON (customer_id) customer_id, id as latest_entry_id
                FROM customer_entries
                ORDER BY customer_id, created_at DESC
            ) latest ON c.id = latest.customer_id
            LEFT JOIN customer_entries e ON e.id = latest.latest_entry_id
            LEFT JOIN (
                SELECT DISTINCT ON (customer_id) customer_id, id as latest_service_id
                FROM customer_services
                ORDER BY customer_id, created_at DESC
            ) latest_cs ON c.id = latest_cs.customer_id
            LEFT JOIN customer_services cs ON cs.id = latest_cs.latest_service_id AND e.id IS NULL
        '''
        
        clauses = []
        params = []
        
        # Filter by customer status
        if status != 'all':
            clauses.append('c.active_status = ?')
            params.append(status)
        
        # Name filtering - search in merged name field
        if name:
            merged_name_clause = "(LOWER(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) LIKE ?)"
            clauses.append(merged_name_clause)
            params.append(f"%{name.lower()}%")
        
        # New firstName/lastName filters - search in merged name field
        if firstName or lastName:
            name_conditions = []
            if firstName:
                name_conditions.append("LOWER(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) LIKE ?")
                params.append(f"%{firstName.lower()}%")
            if lastName:
                name_conditions.append("LOWER(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) LIKE ?") 
                params.append(f"%{lastName.lower()}%")
            if name_conditions:
                clauses.append(f"({' AND '.join(name_conditions)})")
        
        # Date filters
        if start_date or end_date:
            if start_date and end_date:
                clauses.append('(e.start_date >= ? AND e.end_date <= ?)')
                params.extend([start_date, end_date])
            elif start_date:
                clauses.append('e.start_date >= ?')
                params.append(start_date)
            elif end_date:
                clauses.append('e.start_date <= ?')
                params.append(end_date)
        
        # DOB filter
        if dob:
            clauses.append('c.date_of_birth = ?')
            params.append(dob)
        
        if clauses:
            query += ' WHERE ' + ' AND '.join(clauses)
            
        query += ' ORDER BY c.last_name, c.first_name'
        
        cur.execute(query, params)
        rows = cur.fetchall()
        
        customers = []
        for row in rows:
            customer_dict = dict(row)
            
            # If customer has no entry but has service data, create an entry
            if customer_dict.get('entry_id') is None and customer_dict.get('service_name'):
                logger.info(f"Creating entry for customer {customer_dict['id']} from legacy data")
                entry_id = migrate_customer_service_to_entry(customer_dict)
                customer_dict['entry_id'] = entry_id
                
            # Parse denial codes
            if customer_dict.get('denial_codes'):
                customer_dict['denial_codes'] = customer_dict['denial_codes'].split(',')
            else:
                customer_dict['denial_codes'] = []
                
            # Calculate due amount
            amount_billed = customer_dict.get('amount_billed', 0) or 0
            amount_paid = customer_dict.get('amount_paid', 0) or 0
            customer_dict['due'] = amount_billed - amount_paid
            
            customers.append(customer_dict)
        
        return customers
        
    finally:
        conn.close()

@router.post("/admin/backfill-batch-ids")
def backfill_batch_ids(payload: BackfillBatchIdsPayload, current_user: dict = Depends(get_current_user)):
    """
    One-time repair for legacy data where `customer_entries.batch_id` is NULL.
    Strategy: for each customer, group consecutive NULL/empty rows created within `windowSeconds`
    into a single new UUID batch_id.
    """
    data = payload.dict() if hasattr(payload, "dict") else (payload or {})
    window_seconds = int(data.get("windowSeconds") or 10)
    dry_run = bool(data.get("dryRun", True))

    if window_seconds < 0 or window_seconds > 3600:
        raise HTTPException(status_code=400, detail="windowSeconds must be between 0 and 3600")

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT id, customer_id, created_at
            FROM customer_entries
            WHERE batch_id IS NULL OR batch_id = ''
            ORDER BY customer_id, created_at, id
            """
        )
        rows = cur.fetchall() or []

        updated_rows = 0
        created_batches = 0
        batches_preview = []

        def parse_ts(v):
            if not v:
                return None
            if isinstance(v, datetime):
                return v
            s = str(v)
            # Try common formats: 'YYYY-MM-DD HH:MM:SS' or ISO
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f"):
                try:
                    return datetime.strptime(s.split("+")[0].replace("Z", ""), fmt)
                except Exception:
                    pass
            try:
                return datetime.fromisoformat(s.replace("Z", ""))
            except Exception:
                return None

        current_customer = None
        current_batch_id = None
        current_group_ids = []
        last_ts = None

        def flush_group():
            nonlocal updated_rows, created_batches, current_batch_id, current_group_ids
            if not current_group_ids:
                return
            bid = current_batch_id or str(uuid.uuid4())
            if not dry_run:
                placeholder = ",".join(["?"] * len(current_group_ids))
                cur.execute(
                    f"UPDATE customer_entries SET batch_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN ({placeholder})",
                    [bid, *current_group_ids],
                )
            updated_rows += len(current_group_ids)
            created_batches += 1
            if len(batches_preview) < 25:
                batches_preview.append({"batch_id": bid, "entry_ids": list(current_group_ids)})
            current_batch_id = None
            current_group_ids = []

        for r in rows:
            rid = r["id"] if isinstance(r, dict) else r[0]
            cid = r["customer_id"] if isinstance(r, dict) else r[1]
            ts_raw = r["created_at"] if isinstance(r, dict) else r[2]
            ts = parse_ts(ts_raw)

            if current_customer is None or cid != current_customer:
                flush_group()
                current_customer = cid
                last_ts = ts
                current_batch_id = str(uuid.uuid4())
                current_group_ids = [rid]
                continue

            # If we cannot parse timestamps, treat each row as separate group.
            if ts is None or last_ts is None:
                flush_group()
                current_batch_id = str(uuid.uuid4())
                current_group_ids = [rid]
                last_ts = ts
                continue

            delta = abs((ts - last_ts).total_seconds())
            if delta <= window_seconds:
                current_group_ids.append(rid)
                last_ts = ts
            else:
                flush_group()
                current_batch_id = str(uuid.uuid4())
                current_group_ids = [rid]
                last_ts = ts

        flush_group()

        if not dry_run:
            conn.commit()

        return {
            "dryRun": dry_run,
            "windowSeconds": window_seconds,
            "batchesCreated": created_batches,
            "rowsUpdated": updated_rows,
            "preview": batches_preview,
            "note": "Re-run with dryRun=false to apply. This only affects rows where batch_id is NULL/empty.",
        }
    except Exception as e:
        conn.rollback()
        logger.exception("backfill_batch_ids failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/admin/consolidate-customer-batch-ids")
def consolidate_customer_batch_ids(dryRun: bool = True, current_user: dict = Depends(get_current_user)):
    """
    Repair endpoint: if a customer already has multiple different batch_ids, consolidate them into ONE.
    Canonical batch_id = oldest non-empty batch_id for that customer (by created_at).
    Also fills NULL/empty batch_id rows with the canonical.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT DISTINCT customer_id FROM customer_entries")
        customer_ids = [r['customer_id'] if isinstance(r, dict) else r[0] for r in (cur.fetchall() or [])]
        total_customers = 0
        customers_changed = 0
        rows_updated = 0
        preview = []
        for cid in customer_ids:
            total_customers += 1
            canonical = _get_or_create_canonical_batch_id(cur, int(cid))
            # Count distinct batch ids excluding null/empty
            cur.execute(
                "SELECT DISTINCT batch_id FROM customer_entries WHERE customer_id = ? AND batch_id IS NOT NULL AND batch_id != ''",
                (cid,)
            )
            bids = [r['batch_id'] if isinstance(r, dict) else r[0] for r in (cur.fetchall() or [])]
            distinct = sorted({str(b) for b in bids if b})
            # If there are multiple or there are null/empty rows, we consolidate.
            cur.execute(
                "SELECT COUNT(*) as cnt FROM customer_entries WHERE customer_id = ? AND (batch_id IS NULL OR batch_id = '' OR batch_id != ?)",
                (cid, canonical)
            )
            cnt_row = cur.fetchone()
            needs = (cnt_row.get('cnt') if isinstance(cnt_row, dict) else cnt_row[0]) or 0
            if needs > 0 and canonical:
                customers_changed += 1
                rows_updated += int(needs)
                if len(preview) < 25:
                    preview.append({"customer_id": int(cid), "canonical": canonical, "existing": distinct})
                if not dryRun:
                    cur.execute(
                        "UPDATE customer_entries SET batch_id = ?, updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?",
                        (canonical, cid)
                    )
        if not dryRun:
            conn.commit()
        return {
            "dryRun": bool(dryRun),
            "customersScanned": total_customers,
            "customersChanged": customers_changed,
            "rowsUpdated": rows_updated,
            "preview": preview,
            "note": "Run with dryRun=false to apply. This will force ONE batch_id per customer across ALL their entries.",
        }
    except Exception as e:
        conn.rollback()
        logger.exception("consolidate_customer_batch_ids failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/clear-all-data")
def clear_all_data(current_user: dict = Depends(get_current_user)):
    """Clear all customer and customer_entries data (development only)"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Delete in order to respect foreign key constraints
        cur.execute('DELETE FROM customer_entries')
        cur.execute('DELETE FROM customer_services')  # legacy table
        cur.execute('DELETE FROM customers')
        conn.commit()
        
        # Reset sequences (Postgres)
        try:
            cur.execute('ALTER SEQUENCE customers_id_seq RESTART WITH 1')
            cur.execute('ALTER SEQUENCE customer_entries_id_seq RESTART WITH 1')
            conn.commit()
        except Exception:
            # sequences may not exist or different DB - ignore
            pass
            
        return {'message': 'All customer data cleared successfully'}
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f'Failed to clear data: {str(exc)}')
    finally:
        conn.close()
