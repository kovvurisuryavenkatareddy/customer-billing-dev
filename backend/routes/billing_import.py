from fastapi import APIRouter, UploadFile, File, HTTPException, status, Depends
import pandas as pd
import random
import string
import warnings

# Insert into customers and customer_services tables
from db.database import get_db_connection
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
from datetime import datetime

# Suppress openpyxl warnings about corrupted date cells
warnings.filterwarnings('ignore', category=UserWarning, module='openpyxl')

router = APIRouter()
security = HTTPBearer()

def to_str(val):
    if val is None:
        return None
    # Handle pandas NaTType
    if str(type(val)).endswith("NaTType'>"):
        return None
    # Handle empty strings or whitespace
    if isinstance(val, str) and not val.strip():
        return None
    if hasattr(val, 'isoformat'):
        return val.isoformat()
    return str(val)

def safe_date_convert(date_str):
    """Safely convert date string, handling Excel date errors"""
    if not date_str or not str(date_str).strip():
        return None
    
    date_str = str(date_str).strip()
    
    # Skip obviously corrupted values (large numbers that cause Excel date errors)
    try:
        # If it's a pure number and very large, it's likely corrupted
        if date_str.replace('.', '').replace('-', '').isdigit():
            float_val = float(date_str)
            # Excel date serial numbers should be reasonable (between 1900-2100 roughly)
            if float_val > 100000:  # Clearly corrupted date serial
                return None
    except ValueError:
        pass
    
    # Try to parse common date formats
    import re
    # Look for date patterns like YYYY-MM-DD, MM/DD/YYYY, etc.
    date_patterns = [
        r'\d{4}-\d{2}-\d{2}',  # YYYY-MM-DD
        r'\d{2}/\d{2}/\d{4}',  # MM/DD/YYYY
        r'\d{1,2}/\d{1,2}/\d{4}',  # M/D/YYYY
    ]
    
    for pattern in date_patterns:
        if re.match(pattern, date_str):
            return date_str
    
    return None

@router.post("/import", status_code=status.HTTP_201_CREATED)
def import_billing(file: UploadFile = File(...), credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Accepts an Excel or CSV file and imports billing data into the customers and customer_services tables."""
    filename = file.filename
    ext = os.path.splitext(filename)[-1].lower()
    try:
        if ext in [".xlsx", ".xls"]:
            # Suppress warnings and handle corrupted date cells
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                # read all sheets into a dict, skip first 2 rows, use row 3 (index 2) as header
                # Convert all date columns to string to avoid date parsing issues
                sheets = pd.read_excel(
                    file.file, 
                    sheet_name=None, 
                    skiprows=2,
                    dtype=str,  # Read everything as string to avoid date parsing errors
                    na_filter=False  # Don't convert empty cells to NaN
                )
        elif ext == ".csv":
            # single-sheet CSV, skip first 2 rows, use row 3 as header
            df = pd.read_csv(file.file, skiprows=2, dtype=str, na_filter=False)
            sheets = {"sheet1": df}
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Please upload .csv or .xlsx file.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")

    conn = get_db_connection()
    cur = conn.cursor()
    total_customers = 0
    total_entries = 0
    errors = []

    # Process each sheet separately
    for sheet_name, df in sheets.items():
        # Filter out rows after "TOTAL" and remove empty rows
        if not df.empty:
            # Find the row with "TOTAL" in the first column and stop there
            total_row_idx = None
            first_col = df.iloc[:, 0] if len(df.columns) > 0 else None
            if first_col is not None:
                for idx, val in enumerate(first_col):
                    if pd.notna(val) and str(val).upper().strip() == "TOTAL":
                        total_row_idx = idx
                        break
            
            # Keep only rows before the TOTAL row
            if total_row_idx is not None:
                df = df.iloc[:total_row_idx]
            
            # Remove completely empty rows
            df = df.dropna(how='all')
        
        # Clean column names for this sheet
        try:
            df.columns = [str(c).strip().replace(" ", "_").replace("-", "_").replace("/", "_").lower() for c in df.columns]
        except Exception:
            # If columns cannot be normalized, record error and skip this sheet
            errors.append({"sheet": sheet_name, "row": None, "error": "Failed to normalize columns"})
            continue

        for idx, row in df.iterrows():
            created_at = datetime.utcnow().isoformat()
            try:
                # Per-row processing - commit per successful row so failures don't stop the import
                # Handle the specific format: "Last Name", "First Name" columns
                last_name = to_str(row.get('last_name') or row.get('lastname') or row.get('name'))
                first_name = to_str(row.get('first_name') or row.get('firstname') or '')
                
                # Skip rows where both names are empty or contain only whitespace
                if not last_name or not last_name.strip():
                    continue

                # Extract dates - Excel format has Start/End in separate columns
                date_of_birth = None  # DOB not in this format, will be set separately if needed
                active_status = 'active'  # Default status
                date_of_payment = safe_date_convert(row.get('date_of_payment'))

                rand_str = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
                customer_code = f"{(last_name or 'UNKNOWN')}_{(first_name or 'NA')}_{created_at[:10]}_{idx}_{rand_str}"

                # Check if customer already exists by name + DOB combination
                if date_of_birth:
                    cur.execute(
                        'SELECT id FROM customers WHERE LOWER(last_name) = LOWER(?) AND LOWER(first_name) = LOWER(?) AND date_of_birth = ?', 
                        (last_name, first_name, date_of_birth)
                    )
                else:
                    # If no DOB, just check by name
                    cur.execute(
                        'SELECT id FROM customers WHERE LOWER(last_name) = LOWER(?) AND LOWER(first_name) = LOWER(?)', 
                        (last_name, first_name)
                    )
                
                existing = cur.fetchone()
                if existing:
                    customer_id = existing['id']
                else:
                    cur.execute(
                        'INSERT INTO customers (customer_code, last_name, first_name, date_of_birth, active_status, created_at) VALUES (?,?,?,?,?,?) RETURNING id',
                        (customer_code, last_name, first_name, date_of_birth, active_status, created_at)
                    )
                    customer_id = cur.fetchone()['id']
                    total_customers += 1

                # Common dates for service rows - from Excel format
                start_date = safe_date_convert(row.get('start'))
                end_date = safe_date_convert(row.get('end'))

                # Service type columns mapping based on the Excel format
                # Format: (Service_Name, days_column, amount_billed_column, amount_paid_column)
                service_types = [
                    ('ASSESS', 'assess', 'amount_billed', 'amount_paid'),
                    ('PHP', 'php', 'amount_billed_1', 'amount_paid_1'), 
                    ('IOP', 'iop', 'amount_billed_2', 'amount_paid_2'),
                    ('OP-G', 'op_g', 'amount_billed_3', 'amount_paid_3'),
                    ('OP-Ind', 'op_ind', 'amount_billed_4', 'amount_paid_4'),
                    ('MDRN', 'mdrn', 'amount_billed_5', 'amount_paid_5'),
                ]
                
                # Additional fields from the Excel format
                total_amount_due = parse_amount(row.get('total_amount_due'))

                row_entries = 0
                for svc_name, svc_days_col, svc_billed_col, svc_paid_col in service_types:
                    try:
                        days = parse_int(row.get(svc_days_col))
                        amount_billed = parse_amount(row.get(svc_billed_col))
                        amount_paid = parse_amount(row.get(svc_paid_col))
                    except Exception:
                        days = 0
                        amount_billed = 0.0
                        amount_paid = 0.0

                    if (days and days > 0) or (amount_billed and amount_billed > 0) or (amount_paid and amount_paid > 0):
                        # denial codes may be present per-row
                        denial_codes = row.get('denial_codes') or row.get('denialcode') or None
                        if isinstance(denial_codes, list):
                            denial_codes_str = ','.join([to_str(x) for x in denial_codes if x])
                        else:
                            denial_codes_str = to_str(denial_codes)

                        cur.execute(
                            '''INSERT INTO customer_entries 
                               (customer_id, customer_code, service_name, start_date, end_date, days, rate_per_day, 
                                amount_billed, amount_paid, date_of_payment, date_submitted, denial_codes, created_at)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id''',
                            (
                                customer_id,
                                customer_code,
                                svc_name,
                                start_date,
                                end_date,
                                days if days else None,
                                None,
                                amount_billed if amount_billed else 0.0,
                                amount_paid if amount_paid else 0.0,
                                date_of_payment,
                                created_at,
                                denial_codes_str,
                                created_at,
                            )
                        )
                        cur.fetchone()  # consume returned id
                        row_entries += 1
                        total_entries += 1

                # Commit this row's inserts so failures don't block other rows
                conn.commit()
                if row_entries > 0:
                    total_inserted = total_entries
            except Exception as row_exc:
                # Rollback only the failed row and continue with next
                conn.rollback()
                errors.append({"sheet": sheet_name, "row": int(idx), "error": str(row_exc), "data": row.to_dict() if hasattr(row, 'to_dict') else str(row)})
                import traceback; traceback.print_exc()
                continue

    conn.close()

    result = {
        "message": f"Imported {total_customers} customers and {total_entries} service entries.",
        "sheets_processed": len(sheets),
        "customers_inserted": total_customers,
        "entries_inserted": total_entries,
        "errors": errors
    }

    return result

def parse_amount(val):
    if val is None:
        return 0.0
    if isinstance(val, str):
        val = val.replace('$', '').replace(',', '').strip()
        try:
            return float(val)
        except Exception:
            return 0.0
    try:
        return float(val)
    except Exception:
        return 0.0

def parse_int(val):
    if val is None:
        return 0
    try:
        return int(val)
    except Exception:
        return 0
