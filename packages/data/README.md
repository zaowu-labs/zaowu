# @zaowu-labs/data

Data workflow package for ZaoWu.

This package reads CSV, TSV, JSON, and XLSX inputs for inspection, lightweight
analysis, schema inference, and sampling. Cleaning accepts CSV, TSV, and XLSX.
XLSX support uses the official SheetJS `0.20.3` distribution because the npm
registry package is no longer the current upstream release channel.

Call `inferDataSchema("sales.xlsx")` in Node.js to read the first worksheet, or
run `zw data schema sales.xlsx --json` with the [ZaoWu CLI](https://www.npmjs.com/package/@zaowu-labs/cli). If npm 12
reports `EALLOWREMOTE`, review the pinned SheetJS dependency and the
[installation instructions](https://github.com/zaowu-labs/zaowu/blob/main/docs/GETTING_STARTED.md#install).

Schema inference recognizes numbers, booleans, ISO or `MM/DD/YYYY` calendar
dates, percentages, common currency values, strings, empty columns, and mixed
columns without changing the source values.
JSON column names are normalized for display while values are read from their
original keys, so whitespace and duplicate normalized names do not lose data.
Absent fields remain empty even when their names match JavaScript prototype keys.

Safety:

- Cleaning previews by default when an output path is supplied.
- `zw data clean sales.tsv --output sales.csv` emits CSV. Select `.tsv` for
  plain TSV. Standard output, `.txt`, and extensionless destinations keep the
  input delimiter, with CSV as the XLSX default. For cells containing tabs or
  line breaks, or a record consisting of one empty cell, choose CSV.
- Confirmed writes refuse to overwrite the input file or an existing output.
- XLSX support requires explicit sheet selection when the first sheet is not the
  intended input.
- `--sheet` accepts the exact names returned by `zw data sheets`, including
  surrounding spaces. XLSX cleanup counts trimmed cells in the header and body.

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
JSON accepts UTF-8 objects or arrays of objects, preserves nested values as JSON
cell text, and rejects primitive/mixed arrays. CSV and TSV accept UTF-8 and
BOM-marked UTF-16 in either byte order, including tab-delimited Unicode text
exported from spreadsheets. Invalid byte sequences, embedded NULs, and
unclosed or misplaced CSV quotes produce a read error.
Doubled literal quotes, multiline CSV fields, and whitespace around
quoted fields are supported. Sheet listing verifies CSV/TSV/JSON files are readable;
`--sheet` is only valid for XLSX. XLSX formulas are not executed: results use stored cell values,
which may need recalculation in a spreadsheet editor before export.

To bind a library write to a preview, pass the preview's `content` to
`cleanData` as `expectedContent` when confirming with `yes: true`.
If the cleaned text has changed, the write fails with `OPERATION_PLAN_MISMATCH`.
