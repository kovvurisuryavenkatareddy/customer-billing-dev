#!/usr/bin/env python3
"""Update `CustomerBilling.customers.date_of_birth` in Neon/Postgres.

This script connects using `DATABASE_URL` (loaded from `backend/.env`) and runs
an UPDATE ... FROM (VALUES ...) statement for a fixed list of customer codes and
DOB strings (DD-MM-YYYY), storing the formatted DOB as MM-DD-YYYY.
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Iterable, List, Tuple

from dotenv import load_dotenv


def _ensure_import_paths() -> None:
    """Ensure `backend/` is importable so `db.database` can be imported.

    When running this script from `backend/scripts/`, Python's sys.path won't
    include `backend/`, so `import db...` fails. We add it explicitly.
    """

    backend_dir = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)


def _load_env() -> None:
    # Prefer backend/.env regardless of current working directory.
    backend_dir = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
    env_path = os.path.join(backend_dir, ".env")
    load_dotenv(dotenv_path=env_path)


def _get_rows() -> List[Tuple[str, str]]:
    # dob is DD-MM-YYYY (string) to match the SQL `to_date(..., 'DD-MM-YYYY')`.
    return [
        ("MD500754634", "30-11-1976"),
        ("MD501843998", "24-03-1957"),
        ("MD500745625", "26-04-1962"),
        ("MD500035701", "21-04-1963"),
        ("MD500557120", "19-08-1977"),
        ("MD501731379", "01-09-1981"),
        ("MD502133247", "11-02-1968"),
        ("MD500862934", "25-02-1975"),
        ("MD501226419", "27-06-1967"),
        ("MD500814243", "22-12-1983"),
        ("MD501395486", "01-01-1973"),
        ("MD000014808", "06-08-1953"),
        ("MD500797852", "12-10-1967"),
        ("MD500814592", "18-06-1965"),
        ("MD500823735", "21-01-1966"),
        ("MD502066532", "04-07-1987"),
        ("MD500306573", "13-05-1985"),
        ("MD501642726", "14-12-1981"),
        ("MD500580835", "14-01-1980"),
        ("MD500134619", "02-01-1990"),
        ("MD501027319", "08-09-1971"),
        ("MD502062718", "02-09-1976"),
        ("MD500172766", "06-07-1957"),
        ("MD500746696", "13-11-1989"),
        ("MD500717808", "24-08-2001"),
        ("MD500585557", "02-06-1987"),
        ("MD500850326", "20-09-1990"),
        ("MD501010672", "28-03-1995"),
        ("MD501812193", "17-12-1977"),
        ("MD502150746", "24-05-1957"),
        ("MD501578589", "08-11-1980"),
        ("MD501294002", "01-05-1961"),
        ("MD500776345", "01-12-1958"),
        ("MD500036438", "09-08-1993"),
        ("MD500869662", "03-03-1971"),
        ("MD500024987", "13-09-1971"),
        ("MD501167349", "30-08-1956"),
        ("MD502350581", "23-08-2000"),
        ("MD502132645", "19-07-1967"),
        ("MD502148163", "12-11-1973"),
        ("MD501835315", "06-01-1982"),
        ("MD500055598", "22-05-1987"),
        ("MD501628798", "17-09-1982"),
        ("MD000027354", "22-11-1998"),
        ("MD502120763", "16-12-1985"),
        ("MD500825244", "29-06-1965"),
        ("MD500820029", "27-06-1970"),
        ("MD500901216", "12-06-1964"),
        ("MD500677667", "07-10-1977"),
        ("MD502275884", "18-05-1977"),
        ("MD500821775", "16-04-1985"),
        ("MD501895627", "29-07-1981"),
        ("MD500974372", "03-10-1989"),
        ("MD000027668", "21-06-1979"),
        ("MD501605626", "31-07-1993"),
        ("MD501103950", "22-07-1977"),
        ("MD502126895", "12-09-1964"),
        ("MD500835872", "12-02-1994"),
        ("MD502345510", "22-11-1998"),
        ("MD502212617", "29-08-1963"),
        ("MD502264806", "19-11-1963"),
        ("MD502388282", "30-03-1972"),
        ("MD500918857", "26-03-1966"),
        ("MD500692990", "09-04-1986"),
        ("MD501605252", "22-09-1994"),
        ("MD501013719", "21-08-1984"),
        ("MD000029861", "08-02-1982"),
        ("MD000024858", "14-05-1979"),
        ("MD502298933", "05-11-1984"),
        ("MD501483669", "25-10-1971"),
        ("MD501428534", "30-08-1996"),
        ("MD500721132", "01-04-1983"),
        ("MD500778900", "23-10-1984"),
        ("MD500989216", "31-01-1987"),
        ("MD501979087", "07-09-1998"),
        ("MD501678122", "28-07-1982"),
        ("MD500854423", "31-12-1988"),
        ("MD500869571", "20-09-1991"),
    ]


def _chunks(seq: Iterable[Tuple[str, str]], n: int) -> Iterable[List[Tuple[str, str]]]:
    batch: List[Tuple[str, str]] = []
    for item in seq:
        batch.append(item)
        if len(batch) >= n:
            yield batch
            batch = []
    if batch:
        yield batch


def run(*, dry_run: bool, schema: str | None) -> int:
    _ensure_import_paths()
    _load_env()

    from db.database import get_db_connection  # type: ignore

    import psycopg2.extras

    rows = _get_rows()
    if not rows:
        print("No rows provided; nothing to update.")
        return 0

    codes = [c for (c, _dob) in rows]
    # Prefer schema argument if provided, otherwise DATABASE_SCHEMA (if set).
    target_schema = (schema or "").strip() or (os.getenv("DATABASE_SCHEMA") or "").strip() or None

    conn = get_db_connection()
    try:
        total_updated = 0
        cur = conn.cursor()
        try:
            # Preflight: show where we're connected and whether codes exist.
            try:
                cur.execute("SELECT current_database() AS db, current_user AS usr, current_schema() AS schema")
                meta = cur.fetchone() or {}
                cur.execute("SHOW search_path")
                sp = cur.fetchone()
                sp_val = None
                if isinstance(sp, dict):
                    sp_val = sp.get("search_path")
                elif isinstance(sp, (list, tuple)) and sp:
                    sp_val = sp[0]
                print(f"Connected to db={meta.get('db')} user={meta.get('usr')} current_schema={meta.get('schema')}")
                if sp_val:
                    print(f"search_path={sp_val}")
            except Exception:
                # Non-fatal: metadata is just for debugging
                pass

            if target_schema:
                try:
                    cur.execute(f'SET search_path TO "{target_schema}", public')
                except Exception as e:
                    print(f"Warning: could not SET search_path to schema={target_schema!r}: {e}")

            cnt_id_number = 0
            try:
                cur.execute("SELECT COUNT(*) AS cnt FROM customers WHERE id_number = ANY(%s)", (codes,))
                cnt_id_number = (cur.fetchone() or {}).get("cnt", 0)
                print(f"Matches found in customers table by id_number={cnt_id_number}")
            except Exception:
                pass

            if not cnt_id_number:
                print(
                    "No matching rows found for provided codes in customers.id_number. Nothing to update."
                )
                return 0

            sql = """
            UPDATE customers c
            SET date_of_birth =
                to_char(to_date(v.dob,'DD-MM-YYYY'),'MM-DD-YYYY')
            FROM (VALUES %s) AS v(code, dob)
            WHERE c.id_number = v.code
            AND c.date_of_birth IS DISTINCT FROM
                to_char(to_date(v.dob,'DD-MM-YYYY'),'MM-DD-YYYY');
            """

            # keep batches modest so query size stays predictable
            for batch in _chunks(rows, 200):
                psycopg2.extras.execute_values(cur, sql, batch, page_size=len(batch))
                # rowcount reflects updated rows for the last statement
                if cur.rowcount and cur.rowcount > 0:
                    total_updated += cur.rowcount
        finally:
            try:
                cur.close()
            except Exception:
                pass

        if dry_run:
            conn.rollback()
            print(f"[DRY RUN] Would update approximately {total_updated} row(s). Rolled back.")
        else:
            conn.commit()
            print(f"Updated {total_updated} row(s).")

        return 0
    except Exception as e:
        conn.rollback()
        print(f"Update failed: {e}", file=sys.stderr)
        return 1
    finally:
        try:
            conn.close()
        except Exception:
            pass


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Update customers.date_of_birth (TEXT) by matching customers.id_number."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run the update but rollback instead of committing.",
    )
    parser.add_argument(
        "--schema",
        default=None,
        help='Optional schema name to target (e.g. "public"). Overrides DATABASE_SCHEMA for this run.',
    )
    args = parser.parse_args()
    return run(dry_run=bool(args.dry_run), schema=args.schema)


if __name__ == "__main__":
    raise SystemExit(main())

