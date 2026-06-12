# @zaowu/doc

Document workflow package for ZaoWu.

This package extracts and summarizes text from supported document inputs,
including text-like files, PDF, and DOCX in the foundation version.

## PDF Support Note (Foundation Workaround)

PDF text extraction uses `pdf-parse`. That library has a transitive/optional
dependency on `@napi-rs/canvas`. Even for pure text extraction, in many Node
environments it will emit a warning or assume certain DOM globals exist.

We install minimal shims for `DOMMatrix`, `ImageData` and `Path2D` on
`globalThis` (only if they are missing) and temporarily suppress the exact
canvas warning during the dynamic import. This is a contained, documented
workaround.

Long-term we would prefer a pure-JS text-only PDF extractor that does not
require these shims. See the source comments in `src/index.ts` (functions
`ensurePdfTextRuntime` and `importPdfParse`) for the full explanation and
the class names used for the shims.

Safety:

- Document conversion previews by default when an output path is supplied.
- Confirmed writes refuse unsafe overwrites.
- Format support should stay explicit in command help and docs.
