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

## Real-input limits and analysis

All inputs are bounded to 20 MiB. Tables allow 250,000 data rows, 1,024 columns,
and two million rectangular cells including the header. XLSX is checked against
an actual 64 MiB inflated-byte budget and 2,000 archive entries before SheetJS
parsing. Oversized worksheet ranges fail before sparse cells are enumerated.
No data is silently truncated to fit a limit.

Numeric `count`, `min`, `max`, and `average` use finite numeric cells only;
`missingCount` and `nonNumericCount` explain excluded cells. Leading-zero IDs,
units such as `20kg`, and numeric overflow remain non-numeric source values.
A scaled compensated mean avoids overflow on finite extreme values.

Extra unnamed columns receive stable `column_N` headers instead of losing data.
JSON accepts an object or arrays of objects, preserves nested values as JSON
cell text, and rejects primitive/mixed arrays. Unclosed CSV quotes fail with a
repair hint. Misplaced quotes and invalid UTF-8 also fail instead of changing
cell values. Doubled literal quotes, multiline CSV fields, and whitespace around
quoted fields are supported. Sheet listing verifies CSV/TSV/JSON files are readable;
`--sheet` is only valid for XLSX. XLSX formulas are not executed: results use stored cell values,
which may need recalculation in a spreadsheet editor before export.

Confirmation execution also checks the freshly prepared content against the
already verified plan immediately before the write/request. Changes between
reads fail with `OPERATION_PLAN_MISMATCH` and produce no write or network call.
