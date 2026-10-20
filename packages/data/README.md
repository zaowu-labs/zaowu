# @zaowu-labs/data

Data workflow package for ZaoWu.

This package reads CSV, TSV, JSON, and XLSX inputs for inspection, lightweight
analysis, schema inference, sampling, and preview-first cleaning.
XLSX support uses the official SheetJS `0.20.3` distribution because the npm
registry package is no longer the current upstream release channel.

Schema inference recognizes numbers, booleans, ISO or `MM/DD/YYYY` calendar
dates, percentages, common currency values, strings, empty columns, and mixed
columns without changing the source values.
JSON column names are normalized for display while values are read from their
original keys, so whitespace and duplicate normalized names do not lose data.
Absent fields remain empty even when their names match JavaScript prototype keys.

Safety:

- Cleaning previews by default when an output path is supplied.
- Confirmed writes refuse to overwrite the input file or an existing output.
- XLSX support requires explicit sheet selection when the first sheet is not the
  intended input.
