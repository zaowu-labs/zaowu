# ZaoWu Maintenance Priorities

ZaoWu is one local-first AI toolkit for developers, technical creators, and small
teams. Keep command grammar, configuration, errors, safety disclosures, and JSON
contracts consistent across its nine domains.

## Current baseline

- All 11 public packages release together from the canonical repository.
- Six CI jobs cover Ubuntu, Windows, and macOS on Node 20.19 and Node 24.
- Release checks build and inspect the actual compiled tarballs and install the
  packed CLI. Public packages use protected npm Trusted Publishing and provenance.
- Local document/data processing, model requests, Git previews, workflow planning,
  template teaching drafts, HTTP previews, and local manifest management exist.
- Workflow shell execution and plugin-code execution remain outside this release.

## Delivered foundation improvements (1.1.0)

Experience contracts: [Foundation quality](experience/ZW_FOUNDATION_QUALITY.md)
and [composed jobs](experience/ZW_COMPOSED_JOBS.md).

- P0: removed Mammoth's vulnerable CLI chain and the approved exception; the full
  production audit now requires zero accepted findings.
- P1 AI: streaming for all three real adapters, cancellation across the transport,
  bounded complete-response validation, retries only before output, local HTTP
  fixtures, and an active Anthropic default.
- P1 documents/data: real rich fixtures, bounded inputs/inflation, OCR guidance,
  Markdown/DOCX structure, missing values, preserved columns, and finite statistics.
- P1 Git: read-only integration fixtures, safe diff invocation, robust filenames,
  heuristic/model labeling, and useful Echo behavior.
- P2 plans: compact human formatting preserves all targets and the JSON contract.
- P2 composition: runnable [recipes](WORKFLOWS.md), ownership/approval spec, and
  regressions rejecting stale intermediate-file confirmation and changes between
  reads during a confirmed command.

## Next maintenance priorities

The [2026-10-25 execution-integrity review](reviews/2026-10-25-integrity.md) follows
the 1.1.0 baseline with the 1.1.1 patch: directory-bound confirmation, complete
configuration replacement and original-input checks, complete JSON/stream model
answers, bounded metadata reads, strict workflow versions/variables, validated
installed manifests, and nonblocking HTTP cleanup. The governing contract is
[execution integrity](experience/ZW_EXECUTION_INTEGRITY.md).

1. Track provider lifecycle and protocol changes against the documented local HTTP
   fixtures; live account/model access remains the user's explicit choice.
2. Expand representative real-world DOCX/PDF/table fixtures before promising layout,
   OCR, formula evaluation, or additional formats. Keep limits explicit.
3. Improve semantic Git review quality from reproduced examples rather than treating
   heuristic warnings or model output as proof that a change is correct.
4. Introduce structured cross-domain workflow actions only after typed handoffs,
   per-step plans, approval scope, and failure receipts are implemented and tested.
   Shell/network execution remains blocked.

Prioritize reproduced user failures over adding domains. Keep the broader
[roadmap](ROADMAP.md) as direction.

## Delivery loop

1. Record the user problem and observable success criteria in the experience spec.
2. Add a regression that reproduces a behavioral defect before changing code.
3. Implement in the owning package; compose cross-domain work in the CLI.
4. Update action help, README/guide examples, schemas, and changelog as needed.
5. Run `corepack pnpm verify`, `corepack pnpm audit:prod`, and manual first-use
   examples. Inspect the diff and the exact artifacts that will be published.
6. Use a pull request; wait for all six CI jobs before merging. Release from a
   green `main`, keep tags immutable, and verify registry versions, signatures,
   source/integrity bindings, and installed commands after publishing.

Bug and feature issue forms, the PR template, weekly dependency updates, and
existing release protections are already in place. Use these workflows and keep
maintenance decisions tied to user-visible results.
