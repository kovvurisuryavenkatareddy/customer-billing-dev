#!/usr/bin/env python3
"""
Excel to CSV Converter Script

Converts .xlsx files to .csv format with robust error handling for:
- Date parsing issues (like the openpyxl warnings you're seeing)
- Multiple sheets (converts each sheet to separate CSV)
- Large files
- Corrupted cells

Usage:
    python xlsx_to_csv.py input.xlsx [output_directory]

Examples:
    python xlsx_to_csv.py data.xlsx
    python xlsx_to_csv.py data.xlsx ./converted_files/
    python xlsx_to_csv.py "C:/path/to/file.xlsx" "C:/output/"
"""

import pandas as pd
import os
import sys
import warnings
from pathlib import Path

def convert_xlsx_to_csv(xlsx_file_path, output_dir=None):
    """
    Convert Excel file to CSV format(s).
    
    Args:
        xlsx_file_path (str): Path to the .xlsx file
        output_dir (str, optional): Output directory. Defaults to same directory as input file.
    
    Returns:
        list: List of created CSV file paths
    """
    # Suppress openpyxl date warnings that don't affect functionality
    warnings.filterwarnings('ignore', category=UserWarning, module='openpyxl')
    
    xlsx_path = Path(xlsx_file_path)
    
    # Validate input file
    if not xlsx_path.exists():
        raise FileNotFoundError(f"Excel file not found: {xlsx_file_path}")
    
    if xlsx_path.suffix.lower() not in ['.xlsx', '.xls']:
        raise ValueError(f"File must be .xlsx or .xls format, got: {xlsx_path.suffix}")
    
    # Determine output directory
    if output_dir is None:
        output_dir = xlsx_path.parent
    else:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
    
    base_name = xlsx_path.stem
    created_files = []
    
    try:
        print(f"Reading Excel file: {xlsx_file_path}")
        
        # Read all sheets from Excel file
        # Using xlsxwriter engine and error handling for problematic cells
        sheets_dict = pd.read_excel(
            xlsx_file_path,
            sheet_name=None,  # Read all sheets
            engine='openpyxl',
            na_values=['', ' ', 'NULL', 'null', 'N/A', 'n/a', '#N/A', '#NULL!'],
            keep_default_na=True
        )
        
        print(f"Found {len(sheets_dict)} sheet(s): {list(sheets_dict.keys())}")
        
        # Convert each sheet to CSV
        for sheet_name, df in sheets_dict.items():
            # Clean sheet name for filename (remove invalid characters)
            safe_sheet_name = "".join(c for c in sheet_name if c.isalnum() or c in (' ', '-', '_')).strip()
            safe_sheet_name = safe_sheet_name.replace(' ', '_')
            
            if len(sheets_dict) == 1:
                # Single sheet - use original filename
                csv_filename = f"{base_name}.csv"
            else:
                # Multiple sheets - include sheet name
                csv_filename = f"{base_name}_{safe_sheet_name}.csv"
            
            csv_path = output_dir / csv_filename
            
            try:
                # Convert problematic date columns to string to avoid parsing issues
                for col in df.columns:
                    if df[col].dtype == 'object':
                        # Check if column might contain dates with parsing issues
                        sample_values = df[col].dropna().head(10)
                        for val in sample_values:
                            if isinstance(val, (int, float)) and val > 1000000:
                                # Likely a problematic date serial number
                                print(f"Converting column '{col}' to string (contains large numbers that might be corrupted dates)")
                                df[col] = df[col].astype(str)
                                break
                
                # Write to CSV with proper encoding and error handling
                df.to_csv(
                    csv_path,
                    index=False,
                    encoding='utf-8-sig',  # Handles special characters and BOM
                    na_rep='',  # Empty string for NaN values
                    float_format='%.2f'  # Format floats to 2 decimal places
                )
                
                created_files.append(str(csv_path))
                print(f"✓ Created: {csv_path} ({len(df)} rows, {len(df.columns)} columns)")
                
            except Exception as e:
                print(f"✗ Error converting sheet '{sheet_name}': {e}")
                continue
        
        return created_files
        
    except Exception as e:
        print(f"✗ Error reading Excel file: {e}")
        raise

def main():
    """Command line interface for the converter."""
    # Correct file path and output directory
    xlsx_file = r"scripts/2024 Weekly Billing Sheet.xlsx"
    output_dir = r"scripts/output_folder"
    try:
        created_files = convert_xlsx_to_csv(xlsx_file, output_dir)
        print(f"\n✓ Successfully converted {len(created_files)} file(s):")
        for file_path in created_files:
            print(f"  - {file_path}")
    except Exception as e:
        print(f"\n✗ Conversion failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()