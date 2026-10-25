# Execution-integrity review — 2026-10-25

The 1.1.1 patch strengthens the existing local-first CLI foundation. It keeps all
public command names, JSON keys, and schema version 1, and adds no dependency,
shell executor, plugin runner, cloud service, or autonomous agent.

## Findings and delivered changes

| Area                   | Reproduced problem                                                                                                                                             | Fix and principal files                                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paths and confirmation | Identical relative document/data paths in two projects shared a fingerprint; CLI API file commands ignored its `cwd`                                           | Absolute paths in CLI file handlers, supplied cwd for teaching/plugin sources, cross-directory rejection; CLI `run.ts`, `handler-utils.ts`, handlers                                                  |
| Configuration          | Changed inputs after verification could be overwritten; direct writes could truncate existing config; comment-only migration edits escaped output-only binding | Source and output digests, final source recheck, complete temporary-file replacement, preserved permissions, exclusive new-file creation, link refusal; config `index.ts`, `write.ts`, config handler |
| AI answers             | HTTP 200 JSON and contradictory terminal streams could return partial text as success                                                                          | Shared completion checks for all three adapters, required Anthropic text stop, no retry after incomplete output, normalized safe integer usage; AI `completion.ts`, `stream.ts`, `index.ts`           |
| Workflows              | Inherited object properties supplied variables; future/malformed versions could write files; non-object JSON roots were accepted                               | Own-property substitution, preserved explicitly named variables, version-gated writes, object roots and bounded reads; auto `index.ts`                                                                |
| Plugins                | Arbitrary installed JSON/extra fields and linked manifests escaped the list contract; changed removal input was deleted                                        | Validated three-field results, unreadable sentinel, bounded metadata, resolved sources, target recheck and recovery errors; plugin `index.ts`, plugin handler                                         |
| Web                    | HEAD/success bodies stayed open; exact byte caps waited for another read; cancellation could hang beyond the timeout                                           | Shared header/body deadline, immediate cap stop, abort/release on every exit, nonblocking cleanup, credential-free URLs; web `index.ts`                                                               |
| Small inputs           | Configuration, plugin, workflow, and teaching file reads allocated unbounded content                                                                           | One-MiB metadata/teaching limits; four-MiB workflow byte cap plus existing text limit; owning domain packages                                                                                         |

The experience contract is [execution integrity](../experience/ZW_EXECUTION_INTEGRITY.md).
READMEs, Getting Started, JSON contracts, error-code registry/schema, maintenance
notes, and changelog describe the observable behavior. All twelve manifests use
1.1.1; the eleven public packages remain a synchronized release.

## Evidence

- Added 54 focused regressions across seven new test files. Initial cases reproduced
  cross-directory confirmation, post-verification config changes, incomplete JSON,
  prototype variables, future workflow writes, invalid plugin metadata, and hanging
  web cleanup before their fixes. Later regressions cover comment-only changes,
  terminal stream contradictions, I/O failure preservation, and input bounds.
- Functional suite: 587 tests in 38 files. Existing audit/publication policy tests:
  13 cases. Coverage: 93.36% lines/statements, 85.80% branches, 95.46% functions;
  existing thresholds are unchanged.
- Production dependency audit: passed with no exceptions. No dependency changed.
- `corepack pnpm verify`: passed, including build/test typecheck, source/package
  boundaries, schemas, real rich fixtures, JSON contracts, capabilities, CLI smoke,
  functional/script tests, lint/format, release readiness, all eleven tarballs, and
  fresh installation of the packed CLI.
- Compiled executable checks: separate document conversion approval, Unicode model
  streaming, a single JSON result, and real SIGINT cancellation (exit 130, one call).
- Additional executable checks passed for absolute paths, cross-directory rejection,
  comment-only config preservation, blocked future workflow writes, and incomplete
  JSON rejection for all three real adapters (one request each, fake credentials).
- Full release gates, six supported CI jobs, and post-publication acceptance are
  required by the delivery loop; record their verified outcome with the release.

## Manual checks

```bash
corepack pnpm verify
corepack pnpm audit:prod
corepack pnpm test:coverage
zw --version
zw doc convert report.html --output report.md --json
zw config migrate --json
zw auto plan workflow.yml --json
```

Preview before confirming. Copy the complete displayed confirmation command in
the same project. Changing config comments, source content, or working directory
requires a new preview. Model protocol tests use local servers and fake credentials.

## Limits and follow-up

Complete-file replacement protects against partial writes and detected source
changes, but does not claim a conditional transaction with unrelated external
writers in the final filesystem check/replacement window. Linked config targets
must be replaced by regular files before updating. Compatible JSON model proxies
may omit completion metadata; explicit failure is always rejected. At a web byte
cap, exact full-body length remains unknown and is reported conservatively.

OCR, visual layout fidelity, formula evaluation, semantic review guarantees, shell
workflow execution, and plugin-code execution remain outside this patch. No live
paid model account is required or exercised by these checks.
