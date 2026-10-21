# Foundation quality

## 1. Feature Name

Reliable local inputs, cancellable AI, useful Git assistance, and readable plans.

## 2. Problem

A toolkit is useful only when real files, interrupted requests, and mixed Git
changes produce trustworthy results. DOCX currently brings an unpatched CLI-only
dependency; successful HTTP headers do not guarantee a complete model answer.

## 3. Target Users

Developers, technical creators, automation-heavy users, and small teams using `zw`.

## 4. User Story

Read a report or table locally, inspect changes, then explicitly choose whether
to send selected content to a model or confirm a proposed write.

## 5. Command Design

Keep existing command names and `zw <domain> <action> [target] [options]` grammar.
Compose repeated jobs through documented explicit commands before adding runners.

## 6. Golden Path

1. `zw doc outline report.docx --json` retains document headings.
2. `zw data analyze sales.xlsx --json` reports missing values truthfully.
3. `zw dev review --json` distinguishes local heuristics from model assistance.
4. `zw ai ask --file report.md --provider ollama` previews the payload/endpoint.
5. Confirm the displayed plan; human output streams, JSON stays one envelope.

## 7. Inputs and Outputs

DOCX reads main-body paragraphs, heading styles, lists, tables, and safe links.
It does not execute macros or fetch relationships. Images/OCR, footnotes, layout,
tracked deletions, and embedded objects are outside text extraction. Limit input
files to 20 MiB, each requested XML part to 8 MiB, and extracted text to two
million characters. Reject over-limit input rather than silently truncating it.
Data input limits and extraction limitations must be documented and tested.
AI output is bounded, requires a terminal stream event, and exposes cancellation.

## 8. AI Behavior

Local summaries and Git rules are labeled as heuristics. Human model requests may
stream; JSON requests remain non-streaming. Never retry after output has started.
Interrupted or malformed output is an error, not a successful partial answer.

## 9. Safety

Preserve previews, confirmation fingerprints, exclusive writes, and domain
boundaries. Recheck prepared content immediately before write/network execution
so an input changed during one command cannot bypass its verified fingerprint.
Compact human plans retain every sensitive target and confirmation
instruction. JSON plans and schema version remain compatible. No shell workflow
execution or plugin execution is introduced. Remove the dependency exception
only after the published runtime dependency chain is actually removed.

## 10. Errors

Missing/unreadable files explain path/permissions; corrupt rich files explain
re-exporting; size limits explain splitting; empty PDF extraction explains OCR.
Cancellation explains that the request stopped and partial output is incomplete.
Provider timeouts and malformed events never expose credentials or response bodies.

## 11. Help Text

Update action help and package guides for changed behavior and explicit limits.
Retain discoverability through `zw help <domain> <action>` and `--help`.

## 12. Tests

Use real ZIP/XML/PDF/XLSX fixtures, local HTTP servers, and temporary Git repos.
Cover valid, missing, invalid, oversized, interrupted, malformed, JSON, preview,
and confirmed cases. Compare repository state before/after read-only Git commands.

## 13. Documentation

Update package READMEs, maintenance priorities, security review, user guides,
command experience documents, error registry/schema, changelog, and release notes.

## 14. Acceptance Criteria

Production audit passes with zero exceptions. Full verification and all six CI
jobs pass. Publish all 11 packages from green main, then verify provenance,
signatures, integrity, and installed commands before declaring delivery complete.

## 15. Open Questions

Complex document layout/OCR and shell workflow execution remain future work.
Repeated jobs must use the same visible inputs and approval boundaries as their
individual commands; a composition spec precedes any new execution feature.
