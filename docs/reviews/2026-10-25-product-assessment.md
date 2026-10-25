# Product assessment and 1.2.0 — 2026-10-25

## Overall assessment

ZaoWu is worth developing as one local-first toolkit for developers, technical
creators, and small teams. Its useful core is a consistent entry point for Git,
local reports/tables, and deliberately selected models. Shared configuration,
errors, plans, JSON, and protected releases already provide a coherent foundation.

Its main gap is depth of task completion. A long command catalog alone is not a
finished workflow: users need trustworthy source data, a clear approval boundary,
and a reusable result. This release prioritizes the report → model → saved answer
loop and reproduced correctness failures. It adds no domain, dependency, server,
marketplace, or autonomous execution capability.

## Coverage and priority by area

| Area                 | Current verified usefulness                                                                                | Limitation / priority                                                                        | 1.2.0 outcome                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Entry/setup          | init, doctor, action help, structured errors, consistent domain grammar                                    | Human output can contain untrusted terminal controls; ambiguous options must fail            | Controls/directional overrides displayed visibly; conflicting review scopes and unsafe row counts rejected |
| AI                   | Echo, three real HTTP adapters, preview, completion checks, retries before output, cancellation            | Answers previously needed manual copying or shell filtering to reuse                         | Previewed create-only `--output`, complete private-file publication, receipts, no retry after failed save  |
| Developer            | Real Git status, heuristic/AI review, commit suggestions, guarded synchronization                          | Heuristic signals are not semantic proof; model quality needs representative evaluation      | Scope ambiguity rejected before reading Git; existing Git-preservation suites retained                     |
| Documents            | Local text/HTML/PDF/DOCX, extraction/outline/search/conversion, labeled extractive summaries               | OCR and visual layout fidelity remain unsupported; broaden real fixtures before promises     | Existing rich fixtures and report-to-model recipe retained and completed by saved answers                  |
| Data                 | Bounded CSV/TSV/JSON/XLSX, schema/sample/statistics, previewed clean                                       | Malformed quoting/encoding could change cells; sheet commands could report false success     | Strict quote positions and UTF-8, readable-file checks, explicit XLSX-only sheet selection                 |
| Automation           | Versioned plans, messages, bounded new-file writes                                                         | Typed cross-domain actions need failure receipts and approval scope first                    | Existing shell/network blocks retained; no expansion of execution authority                                |
| Plugins              | Bounded validated local manifests and guarded install/remove                                               | Code execution/distribution require a trust and compatibility design                         | Metadata-only boundary retained                                                                            |
| Teaching             | Deterministic local outlines/quizzes with bounded file input                                               | Templates need educator evaluation; not model-generated pedagogy                             | Existing behavior and its explicit template labeling retained                                              |
| Web                  | Explicit bounded HTTP metadata/body requests, no redirects, shared deadline                                | No browser/session automation; results are raw HTTP content                                  | Existing cleanup, timeout, byte-limit, credential and redirect checks retained                             |
| Engineering/delivery | Domain boundaries, real fixtures, versioned JSON, eleven compiled public packages, six CI jobs, provenance | Keep testing user failures and public artifacts; generic high coverage is insufficient alone | New regressions, full artifact/install gates, consumer audit and published-command acceptance              |

There were no open PRs or issues when checked with GitHub CLI for this review.
The assessment uses repository code, specs, regression suites, and installed CLI
behavior, not an assertion that real paid model quality or all user files were tested.

## Reproduced failures and implementation

- Misplaced CSV quotes were stripped: `hello "world"` became `hello world`.
  The dedicated delimited parser now rejects invalid positions while retaining
  doubled quotes, multiline fields, blank records, and supported whitespace.
- Invalid text bytes were replaced during UTF-8 decoding. Table text now fails
  with an encoding/export hint instead of manufacturing different cell values.
- `data sheets missing.csv` returned a default table without reading a file;
  `--sheet Sales` on CSV was ignored. Both now fail with actionable input errors.
- Simultaneous `--staged --worktree` silently chose staged changes; huge `--rows`
  values passed validation and fell back to five. Both fail before their I/O.
- Model/file/error text could issue terminal controls or disguise text direction.
  Rendering escapes those controls at the CLI boundary, including stream chunks;
  JSON values, domain values, and saved answer text remain unchanged. Copyable
  commands encode control-bearing arguments safely for Bash/zsh or PowerShell.
- `runCli` recognized cancellation from raw argument position, missing AI commands
  preceded by global flags. It now uses the parsed command/options.

The new output path is resolved through its physical parent and checked before
provider execution. Plans bind prompt/file digest, provider/model/endpoint, and
output destination. Generated text is explicitly unknown at preview. Echo output
also requires write confirmation. A complete result is staged with private
permissions, flushed, then linked into place exclusively. Conflicts, cancellation,
incomplete responses, and write failures preserve existing targets; no automatic
provider retry follows a completed generation or failed save.

Main files: AI `output.ts`/domain/index, CLI AI handler/option registry/validation/
run/terminal rendering, data `delimited.ts`/input limits/index, new regressions,
AI JSON/error schemas, capability matrix, help/catalog, recipes, guides, and
[experience contract](../experience/ZW_SAVED_ANSWERS.md). All twelve manifests use
1.2.0; eleven packages are public.

## Acceptance evidence

- 30 new regressions across five files; 617 functional tests and 13 existing
  audit/publication policy cases pass. Tests cover happy paths, missing/invalid
  input, dry-run/JSON, streaming, cancellation/failure preservation, private modes,
  target races, links/permissions, CSV/encoding/sheet errors, and terminal rendering.
- Full `corepack pnpm verify` covers build/test typecheck, source/package boundaries,
  schemas/compiled JSON contracts, rich fixtures, capabilities, CLI smoke,
  functional/script tests, lint/format, release metadata, all eleven tarballs,
  and fresh packed CLI installation. No gate or threshold is lowered.
- Coverage passes unchanged thresholds: 93.48% lines/statements, 86.41% branches,
  95.78% functions.
- `corepack pnpm audit:prod` passes with no exceptions and no dependency changes.
- Actual executable acceptance passes for saved raw Unicode/control text,
  terminal-safe human streaming, a single JSON receipt, preview/no request,
  dry-run, preflight conflicts, incomplete answers and cancellation without a
  final file, Ctrl+C with global flags (exit 130), concurrent target preservation,
  malformed CSV rejection, and missing table errors. Local HTTP fixtures use
  fake credentials; no paid model account is called.
- Merge requires all six supported OS/Node jobs; publication requires green main
  and the protected exact-tag release gates. Post-publish installation, signatures,
  integrity/source/workflow provenance, installed rich-input and saved-answer
  acceptance are recorded with the public release.

Manual examples:

```bash
zw --version
zw ai ask "Try saved output" --provider echo --output demo.md --dry-run --json
zw ai ask "List next actions" --file report.md --provider ollama --output actions.md
zw data schema sales.csv --json
zw dev review --staged --json
```

Copy the displayed full confirmation command after reviewing each write/network
plan. Use a fresh output name. A new file contains the model answer only.

## Remaining boundaries and next priorities

1. Evaluate semantic Git review/commit quality against curated, reproduced defects;
   keep heuristic/model labeling and verification of source locations.
2. Broaden real DOCX/PDF/XLSX/CSV fixtures from representative tasks before adding
   format/layout promises. Formulas use stored workbook values; OCR is separate.
3. Expand template teaching quality with educator examples before labeling it AI
   pedagogy. Keep model generation explicitly selected and auditable.
4. Specify typed handoffs, approval scope, and failure receipts before structured
   cross-domain execution. Shell/network workflow and plugin-code execution stay blocked.

Output parents must already exist. A save can fail after a provider has generated
and billed an answer; errors say so and never retry automatically. Publication is
exclusive but is not a conditional transaction against arbitrary external parent
replacement. Cancellation is checked before staging and final publication; a file
already published is not undone by a late signal. Temporary-file cleanup is best
effort after filesystem permission changes. Human control escaping does not alter
raw JSON/files; users control how they subsequently open those artifacts.

JSON serialization uses Unicode escapes for display controls while preserving
parsed values. Saved answer bytes remain the original UTF-8 text.

Answer files use POSIX mode 0600; Windows permissions follow the destination
directory ACLs. Existing output parents are not created or reconfigured.
