#!/usr/bin/env python3
"""Compare two CSV files and output customer names to a TXT file.

Usage examples:
  python compare_csvs.py --file1 ./output_folder/2024 Weekly Billing Sheet_2024_MARCH_WK10.csv \
      --file2 ./output_folder/2024 Weekly Billing Sheet_2024_WK11.csv \
      --out ./compare_results.txt

The script will try to detect name columns (first/last or full name) and
produce lists: only-in-file1, only-in-file2, and common names.
"""
from __future__ import annotations
import csv
import os
from typing import Set, Optional, Tuple, List
from collections import Counter

# -- Configuration: edit these values in the file before running
# Input folder is fixed to the script's `output_folder` subfolder.
INPUT_DIR = os.path.join(os.path.dirname(__file__), 'output_folder')
# Example: change these filenames directly in this script when needed
FILE1_NAME = '2024 Weekly Billing Sheet_2024_WK2.csv'
FILE2_NAME = '2024 Weekly Billing Sheet_2024_WK3.csv'
# Only change this output filename when you want a different result file
OUT_FILENAME = 'week_2_3.txt'

# If you prefer CLI usage, set USE_CLI = True
USE_CLI = False


def detect_name_fields(headers: List[str]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    # Returns (full_field, first_field, last_field)
    low = [h.lower() for h in headers]
    # full name candidates
    for candidate in ("name", "full_name", "customer_name", "customer", "client_name"):
        if candidate in low:
            return (headers[low.index(candidate)], None, None)
    # try patterns for combined single header containing 'name'
    for i, h in enumerate(low):
        if 'name' in h and h not in ('first_name','last_name','firstname','lastname','first','last'):
            return (headers[i], None, None)
    # first/last pairs
    first_candidates = ['firstname', 'first_name', 'first', 'given_name', 'givenname', 'forename']
    last_candidates = ['lastname', 'last_name', 'last', 'surname', 'family_name']
    first = next((headers[low.index(c)] for c in first_candidates if c in low), None)
    last = next((headers[low.index(c)] for c in last_candidates if c in low), None)
    return (None, first, last)


def normalize_name(s: str) -> str:
    if s is None:
        return ''
    return ' '.join(s.strip().split())


def extract_names_from_csv(path: str) -> Set[str]:
    names = set()
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    with open(path, newline='', encoding='utf-8', errors='replace') as fh:
        reader = csv.DictReader(fh)
        headers = reader.fieldnames or []
        full_field, first_field, last_field = detect_name_fields(headers)
        for row in reader:
            if full_field and row.get(full_field):
                nm = normalize_name(row.get(full_field))
                if nm:
                    names.add(nm)
                    continue
            if first_field and last_field and (row.get(first_field) or row.get(last_field)):
                fn = normalize_name(row.get(first_field) or '')
                ln = normalize_name(row.get(last_field) or '')
                candidate = f"{fn} {ln}".strip()
                if candidate:
                    names.add(candidate)
                    continue
            # fallback: try common combined columns such as "customer_code"+last/first
            # try any header containing 'customer' or 'client' then last/first
            combined = None
            for h in headers:
                if 'customer' in h.lower() or 'client' in h.lower():
                    val = normalize_name(row.get(h) or '')
                    if val:
                        combined = val
                        break
            if combined:
                names.add(combined)
                continue
            # last resort: take first non-empty cell from the row
            for h in headers:
                v = normalize_name(row.get(h) or '')
                if v:
                    names.add(v)
                    break
    return names


def write_results(out_path: str, only1: Set[str], only2: Set[str], common: Set[str], unique: Set[str]) -> None:
    with open(out_path, 'w', encoding='utf-8') as fh:
        fh.write('Only in file1 (count=%d)\n' % len(only1))
        for n in sorted(only1):
            fh.write(n + '\n')
        fh.write('\nOnly in file2 (count=%d)\n' % len(only2))
        for n in sorted(only2):
            fh.write(n + '\n')
        fh.write('\nCommon (count=%d)\n' % len(common))
        for n in sorted(common):
            fh.write(n + '\n')
        fh.write('\nUnique across both files (appear exactly once) (count=%d)\n' % len(unique))
        for n in sorted(unique):
            fh.write(n + '\n')


def main() -> None:
    """Run comparison using constants defined at the top of the file.

    Edit `INPUT_DIR`, `FILE1_NAME`, `FILE2_NAME`, and `OUT_FILENAME` above
    when you want to compare different files. If you set `USE_CLI = True`,
    the script will expose the old CLI behavior.
    """
    if USE_CLI:
        import argparse
        p = argparse.ArgumentParser(description='Compare two CSVs and output customer name differences')
        p.add_argument('--file1', required=True, help='Path to first CSV')
        p.add_argument('--file2', required=True, help='Path to second CSV')
        p.add_argument('--out', required=False, default='./compare_results.txt', help='Output text file')
        args = p.parse_args()
        f1 = os.path.abspath(args.file1)
        f2 = os.path.abspath(args.file2)
        out = os.path.abspath(args.out)
    else:
        f1 = os.path.abspath(os.path.join(INPUT_DIR, FILE1_NAME))
        f2 = os.path.abspath(os.path.join(INPUT_DIR, FILE2_NAME))
        out = os.path.abspath(os.path.join(os.path.dirname(__file__), OUT_FILENAME))

    print(f'Reading {f1} ...')
    names1 = extract_names_from_csv(f1)
    print(f'Reading {f2} ...')
    names2 = extract_names_from_csv(f2)

    only1 = names1 - names2
    only2 = names2 - names1
    common = names1 & names2
    # compute uniques across both files: appear exactly once in combined multiset
    combined = list(names1) + list(names2)
    counts = Counter(combined)
    unique = {n for n, c in counts.items() if c == 1}

    write_results(out, only1, only2, common, unique)
    print(f'Wrote results to {out}')


if __name__ == '__main__':
    main()
