"""
Tests for the member-block parsing fix in routes/billing_import.py.

Covers:
  - _find_member_blocks: grouping spreadsheet rows into member blocks by
    member-number (col A), regardless of blank rows or how far the
    customer's data is offset from the member-number row.
  - _extract_customer_info: pulling name/MD-id/DOB/etc. from anywhere in a
    member block, not just the member-number row.
  - _resolve_customer: existing user matching/creation logic (unchanged by
    this fix) — verified here to confirm the parser feeds it correctly and
    that matching/duplicate-prevention behavior is preserved.

Run with:  backend\\venv\\Scripts\\python.exe -m unittest discover -s backend\\tests -v
(or from inside backend/:  venv\\Scripts\\python.exe -m unittest discover -s tests -v)
"""
import os
import sys
import unittest
from datetime import datetime

# billing_import.py imports db.database at module load time, which requires
# DATABASE_URL to be set (it never needs to be reachable — none of the
# functions under test here call get_db_connection()).
os.environ.setdefault('DATABASE_URL', 'postgresql://test:test@localhost/test')

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from openpyxl import Workbook  # noqa: E402

from routes.billing_import import (  # noqa: E402
    _find_member_blocks,
    _extract_customer_info,
    _resolve_customer,
)


def _sheet_from_rows(rows):
    """Build a worksheet from a list of rows (each a list of cell values,
    1-indexed: rows[0] -> row 1, rows[0][0] -> col A)."""
    wb = Workbook()
    ws = wb.active
    ws.title = 'IOP Data'
    for r_idx, row in enumerate(rows, start=1):
        for c_idx, val in enumerate(row, start=1):
            if val is not None:
                ws.cell(r_idx, c_idx, val)
    return ws


# ---------------------------------------------------------------------------
# Tests 1-7: member block detection + field extraction
# ---------------------------------------------------------------------------

class FindMemberBlocksTests(unittest.TestCase):

    def test_1_data_on_same_row(self):
        """100 | HARMON | ALPHONSO | ... -> member 100 is imported."""
        ws = _sheet_from_rows([
            [100, 'HARMON', 'ALPHONSO', 'F11.20', None, datetime(2025, 1, 1)],
        ])
        blocks = _find_member_blocks(ws)
        self.assertEqual(len(blocks), 1)
        start_row, group_rows = blocks[0]
        last_name, first_name, *_ = _extract_customer_info(start_row, group_rows, ws)
        self.assertEqual(last_name, 'HARMON')
        self.assertEqual(first_name, 'ALPHONSO')

    def test_2_one_blank_row(self):
        """100 / (blank) / HARMON|ALPHONSO -> member 100 is imported."""
        ws = _sheet_from_rows([
            [100],
            [],
            [None, 'HARMON', 'ALPHONSO'],
        ])
        blocks = _find_member_blocks(ws)
        self.assertEqual(len(blocks), 1)
        start_row, group_rows = blocks[0]
        self.assertEqual(group_rows, [1, 2, 3])
        last_name, first_name, *_ = _extract_customer_info(start_row, group_rows, ws)
        self.assertEqual(last_name, 'HARMON')
        self.assertEqual(first_name, 'ALPHONSO')

    def test_3_multiple_blank_rows(self):
        """101 / blank x3 / KABA|KOUROUMA -> member 101 is imported (the bug)."""
        ws = _sheet_from_rows([
            [101],
            [],
            [],
            [],
            [None, 'KABA', 'KOUROUMA'],
        ])
        blocks = _find_member_blocks(ws)
        self.assertEqual(len(blocks), 1)
        start_row, group_rows = blocks[0]
        self.assertEqual(group_rows, [1, 2, 3, 4, 5])
        last_name, first_name, *_ = _extract_customer_info(start_row, group_rows, ws)
        self.assertEqual(last_name, 'KABA')
        self.assertEqual(first_name, 'KOUROUMA')

    def test_4_multiple_members(self):
        """100, 101 (offset), 102 -> all three imported, in order."""
        ws = _sheet_from_rows([
            [100, 'HARMON', 'ALPHONSO'],
            [101],
            [],
            [],
            [None, 'KABA', 'KOUROUMA'],
            [102, 'SMITH', 'JOHN'],
        ])
        blocks = _find_member_blocks(ws)
        self.assertEqual(len(blocks), 3)
        names = [_extract_customer_info(sr, gr, ws)[:2] for sr, gr in blocks]
        self.assertEqual(names, [
            ('HARMON', 'ALPHONSO'),
            ('KABA', 'KOUROUMA'),
            ('SMITH', 'JOHN'),
        ])

    def test_5_final_member_is_processed(self):
        """The last member block (no following member-number row) must still
        be finalized and processed, not dropped."""
        ws = _sheet_from_rows([
            [100, 'HARMON', 'ALPHONSO'],
            [101],
            [],
            [None, 'KABA', 'KOUROUMA'],
        ])
        blocks = _find_member_blocks(ws)
        self.assertEqual(len(blocks), 2)
        last_start, last_group = blocks[-1]
        self.assertEqual(last_group, [2, 3, 4])
        last_name, first_name, *_ = _extract_customer_info(last_start, last_group, ws)
        self.assertEqual((last_name, first_name), ('KABA', 'KOUROUMA'))

    def test_6_blank_rows_do_not_terminate_block(self):
        ws = _sheet_from_rows([
            [100],
            [], [], [], [],
            ['HARMON', 'ALPHONSO'],
        ])
        blocks = _find_member_blocks(ws)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0][1], [1, 2, 3, 4, 5, 6])

    def test_7_numeric_billing_values_do_not_start_new_member(self):
        """A plain number (e.g. 35, an auth-unit count) or a date living in a
        *service* column (7-17) must not be mistaken for a member number —
        member-number detection only looks at column A."""
        ws = _sheet_from_rows([
            [100, 'HARMON', 'ALPHONSO', None, None, None, None, 35],  # col H = 35
            [],
            [None, None, None, None, None, None, None, None, '4/23/2026'],  # col I
        ])
        blocks = _find_member_blocks(ws)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0][1], [1, 2, 3])


class ExtractCustomerInfoTests(unittest.TestCase):

    def test_md_id_and_dob_found_anywhere_in_block(self):
        """MD id / DOB / address rows offset from the name row are still found."""
        ws = _sheet_from_rows([
            [101],
            [], [], [],
            [None, 'KABA', 'KOUROUMA', 'F16.20', None, datetime(2025, 11, 18)],
            [None, 'MD000027354'],
            [None, datetime(1998, 11, 22)],
            [None, '5900 YORK RD, 1211'],
        ])
        start_row, group_rows = _find_member_blocks(ws)[0]
        last_name, first_name, f_id, assessment_date, md_id, dob = _extract_customer_info(
            start_row, group_rows, ws
        )
        self.assertEqual(last_name, 'KABA')
        self.assertEqual(first_name, 'KOUROUMA')
        self.assertEqual(md_id, 'MD000027354')
        self.assertEqual(dob, '1998-11-22')

    def test_existing_same_row_layout_still_works(self):
        """Regression guard: when the name IS on the member-number row (the
        already-working case), behavior is unchanged."""
        ws = _sheet_from_rows([
            [100, 'HARMON', 'ALPHONSO', 'F11.20', None, datetime(2025, 1, 1)],
            [None, 'MD501294002'],
            [None, datetime(1961, 5, 1)],
        ])
        start_row, group_rows = _find_member_blocks(ws)[0]
        last_name, first_name, f_id, assessment_date, md_id, dob = _extract_customer_info(
            start_row, group_rows, ws
        )
        self.assertEqual(last_name, 'HARMON')
        self.assertEqual(first_name, 'ALPHONSO')
        self.assertEqual(f_id, 'F11.20')
        self.assertEqual(md_id, 'MD501294002')
        self.assertEqual(dob, '1961-05-01')


# ---------------------------------------------------------------------------
# Tests 8-10: existing user matching / duplicate prevention
# ---------------------------------------------------------------------------

class _FakeCursor:
    """Minimal stand-in for the app's DB cursor — enough to drive
    _resolve_customer's three lookup queries (id_number, name+dob, name-only)
    against an in-memory list of customer rows. Avoids needing a real
    database connection for these tests."""

    def __init__(self, customers):
        self._customers = customers
        self._result = None

    def execute(self, sql, params=None):
        params = params or ()
        sql_l = sql.lower()
        if 'id_number' in sql_l:
            md_norm = params[0]
            self._result = next(
                (c for c in self._customers if (c.get('id_number') or '').upper().strip() == md_norm),
                None,
            )
        elif 'date_of_birth' in sql_l:
            last_u, first_u, dob, dob_alt = params
            self._result = next(
                (c for c in self._customers
                 if c['last_name'].upper().strip() == last_u
                 and c['first_name'].upper().strip() == first_u
                 and c.get('date_of_birth') in (dob, dob_alt)),
                None,
            )
        else:
            last_u, first_u = params
            self._result = next(
                (c for c in self._customers
                 if c['last_name'].upper().strip() == last_u
                 and c['first_name'].upper().strip() == first_u),
                None,
            )

    def fetchone(self):
        return self._result


class ResolveCustomerTests(unittest.TestCase):

    def test_8_existing_user_matched_not_duplicated(self):
        customers = [
            {'id': 42, 'customer_code': 'KABA_KOUROUMA_2025-01-01_ABC123',
             'last_name': 'KABA', 'first_name': 'KOUROUMA',
             'id_number': 'MD000027354', 'date_of_birth': '1998-11-22'},
        ]
        cur = _FakeCursor(customers)
        customer_id, customer_code, found_without_md = _resolve_customer(
            cur, 'KABA', 'KOUROUMA', 'MD000027354', '1998-11-22'
        )
        self.assertEqual(customer_id, 42)
        self.assertEqual(customer_code, 'KABA_KOUROUMA_2025-01-01_ABC123')
        self.assertFalse(found_without_md)

    def test_9_new_user_when_no_match(self):
        cur = _FakeCursor([])
        customer_id, customer_code, found_without_md = _resolve_customer(
            cur, 'SMITH', 'JOHN', 'MD000000102', '2000-01-01'
        )
        self.assertIsNone(customer_id)
        self.assertIsNone(customer_code)

    def test_10_same_customer_matched_across_different_layouts(self):
        """The same MD id must resolve to the same application user
        regardless of which row in the spreadsheet block the fields were
        parsed from — layout differences must never cause a duplicate."""
        customers = [
            {'id': 7, 'customer_code': 'HARMON_ALPHONSO_2025-01-01_XYZ999',
             'last_name': 'HARMON', 'first_name': 'ALPHONSO',
             'id_number': 'MD501294002', 'date_of_birth': '1961-05-01'},
        ]
        cur = _FakeCursor(customers)

        # Layout A: name on the member-number row (Test 1 style)
        ws_a = _sheet_from_rows([
            [100, 'HARMON', 'ALPHONSO', 'F11.20', None, datetime(2025, 1, 1)],
            [None, 'MD501294002'],
            [None, datetime(1961, 5, 1)],
        ])
        start_a, group_a = _find_member_blocks(ws_a)[0]
        last_a, first_a, _, _, md_a, dob_a = _extract_customer_info(start_a, group_a, ws_a)

        # Layout B: name offset by blank rows (Test 3 style)
        ws_b = _sheet_from_rows([
            [100],
            [], [], [],
            [None, 'HARMON', 'ALPHONSO', 'F11.20', None, datetime(2025, 1, 1)],
            [None, 'MD501294002'],
            [None, datetime(1961, 5, 1)],
        ])
        start_b, group_b = _find_member_blocks(ws_b)[0]
        last_b, first_b, _, _, md_b, dob_b = _extract_customer_info(start_b, group_b, ws_b)

        id_a, _, _ = _resolve_customer(cur, last_a, first_a, md_a, dob_a)
        id_b, _, _ = _resolve_customer(cur, last_b, first_b, md_b, dob_b)

        self.assertEqual(id_a, 7)
        self.assertEqual(id_b, 7)
        self.assertEqual(id_a, id_b, 'Different spreadsheet layouts for the same customer must match the same user')


if __name__ == '__main__':
    unittest.main()
