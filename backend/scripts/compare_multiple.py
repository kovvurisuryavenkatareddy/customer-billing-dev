#!/usr/bin/env python3
"""Compare a target CSV against N other CSVs listed in a paths file.

Paths file format (simple key=value lines):
  file1=output_folder/one.csv
  file2=output_folder/two.csv
  target=output_folder/target.csv

The script will compute how many customers in the target file are unique
with respect to the union of all `fileN` files (i.e., appear in target but
not in any of the other files). It writes a results text file and prints
the unique count.
"""
from __future__ import annotations
import csv
import os
import sys
from typing import Set, List, Optional, Tuple
from collections import Counter


def detect_name_fields(headers: List[str]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    low = [h.lower() for h in headers]
    for candidate in ("name", "full_name", "customer_name", "customer", "client_name"):
        if candidate in low:
            return (headers[low.index(candidate)], None, None)
    for i, h in enumerate(low):
        if 'name' in h and h not in ('first_name','last_name','firstname','lastname','first','last'):
            return (headers[i], None, None)
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
            # fallback: try any header that looks like customer or client
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
            # last resort: first non-empty cell
            for h in headers:
                v = normalize_name(row.get(h) or '')
                if v:
                    names.add(v)
                    break
    return names


def parse_paths_file(paths_file: str) -> Tuple[List[str], str]:
    files = []
    target = None
    with open(paths_file, 'r', encoding='utf-8') as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                k, v = line.split('=', 1)
                k = k.strip().lower()
                v = v.strip().strip('"')
                if k == 'target':
                    target = v
                else:
                    files.append(v)
            else:
                # plain path - treat as additional file unless it contains 'target:'
                if line.lower().startswith('target:'):
                    target = line.split(':', 1)[1].strip()
                else:
                    files.append(line)
    if not target:
        raise ValueError('No target path found in paths file (use target=... )')
    return files, target


def write_summary(out_path: str, target_only: Set[str], total_in_target: int, matched_count: int) -> None:
    with open(out_path, 'w', encoding='utf-8') as fh:
        fh.write(f'Target total customers: {total_in_target}\n')
        fh.write(f'Customers in target present in other files (matched): {matched_count}\n')
        fh.write(f'Customers unique to target (not in any other file): {len(target_only)}\n\n')
        fh.write('Unique customers in target:\n')
        for n in sorted(target_only):
            fh.write(n + '\n')


def main():
    if len(sys.argv) < 2:
        print('Usage: python compare_multiple.py <paths_file> [out.txt]')
        print('Paths file should contain lines like: file1=path, file2=path, target=path')
        sys.exit(1)
    paths_file = sys.argv[1]
    out_file = sys.argv[2] if len(sys.argv) >= 3 else os.path.join(os.path.dirname(__file__), 'compare_multiple_results.txt')

    files, target = parse_paths_file(paths_file)
    # Resolve relative paths relative to paths_file location
    base = os.path.dirname(os.path.abspath(paths_file))
    def resolve(p):
        if os.path.isabs(p):
            return p
        return os.path.abspath(os.path.join(base, p))

    src_paths = [resolve(p) for p in files]
    target_path = resolve(target)

    print('Reading source files...')
    union_sources = set()
    for p in src_paths:
        try:
            union_sources.update(extract_names_from_csv(p))
        except Exception as e:
            print(f'Warning: failed to read {p}: {e}')

    print('Reading target file...')
    target_names = extract_names_from_csv(target_path)

    matched = {n for n in target_names if n in union_sources}
    unique_to_target = target_names - union_sources

    print(f'Total in target: {len(target_names)}')
    print(f'Matched in other files: {len(matched)}')
    print(f'Unique to target: {len(unique_to_target)}')

    write_summary(out_file, unique_to_target, len(target_names), len(matched))
    print(f'Wrote summary to {out_file}')


if __name__ == '__main__':
    main()
