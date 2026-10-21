# @zaowu-labs/doc

Document workflow package for ZaoWu.

This package extracts and summarizes text from supported document inputs,
including text-like files, HTML, PDF, and DOCX in the foundation version.
HTML extraction preserves heading levels and lightweight table row structure
when producing text for outline, search, summary, or conversion commands.

## PDF Support Note (Foundation Workaround)

PDF text extraction uses `pdf-parse`. That library has a transitive/optional
dependency on `@napi-rs/canvas`. Even for pure text extraction, in many Node
environments it will emit a warning or assume certain DOM globals exist.

We install minimal shims for `DOMMatrix`, `ImageData` and `Path2D` on
`globalThis` (only if they are missing) and temporarily suppress the exact
canvas warning during the dynamic import. This is a contained, documented
workaround.

Long-term we would prefer a pure-JS text-only PDF extractor that does not
require these shims. See the source comments in `src/pdf.ts` (functions
`ensurePdfTextRuntime` and `importPdfParse`) for the full explanation and
the class names used for the shims.

Safety:

- Document conversion previews by default when an output path is supplied.
- Confirmed writes refuse unsafe overwrites.
- Format support should stay explicit in command help and docs.

## Extraction contract and limits

DOCX uses the existing focused JSZip and xmldom libraries directly, removing
Mammoth and its unused CLI dependency chain. It preserves main-body paragraphs,
heading styles (including inherited/strict namespaces), list structure, tables,
and HTTP(S)/mailto hyperlinks. It never follows external relationships, extracts
archives to disk, or runs macros. Literal Word text is escaped for Markdown.
Footnotes, images/OCR, complex layout, embedded objects, and tracked deletions
are outside this text extraction contract. Re-export complex documents as text
when exact visual fidelity matters.

Input files are limited to 20 MiB; requested DOCX XML parts to 8 MiB each and
2,000 archive entries; extracted text to two million characters. DTD/entity
XML and excessive nesting are rejected. XML budgets apply to actual inflated
bytes. PDF extraction with no text layer explains how to use OCR rather than
returning a misleading successful empty summary. Concurrent PDF extraction
serializes temporary runtime shims and restores the original globals.

`summary` explicitly reports `method: "extractive"`: it takes the first three
prose lines, without calling a model. Frontmatter, fenced code, and headings do
not become summary prose; fenced examples do not create false outline headings.
See [the report-to-model recipe](../../docs/WORKFLOWS.md).

Confirmation execution also checks the freshly prepared content against the
already verified plan immediately before the write/request. Changes between
reads fail with `OPERATION_PLAN_MISMATCH` and produce no write or network call.
