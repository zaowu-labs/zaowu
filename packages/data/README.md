# @zaowu/data

Data workflow package for ZaoWu.

This package reads CSV, TSV, and XLSX inputs for inspection, lightweight
analysis, schema inference, sampling, and preview-first cleaning.

Safety:

- Cleaning previews by default when an output path is supplied.
- Confirmed writes refuse to overwrite the input file or an existing output.
- XLSX support requires explicit sheet selection when the first sheet is not the
  intended input.
