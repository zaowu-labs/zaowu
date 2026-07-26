# ZaoWu Changelog

## Unreleased

- Gave `zw dev commit --ai` and `zw dev review --ai` a real preview-and-confirm
  flow for network providers: the preview shows the operation plan with the
  exact prompt content bound into the fingerprint, and a confirmed run whose
  staged diff changed after preview is rejected before any network request.
- Moved AI commit/review prompt building and response parsing from the CLI
  layer into `@zaowu-labs/dev`, restoring the CLI-composition boundary.
- Unified operation-plan formatting so `zw init` previews use the same
  multi-line plan layout as every other sensitive command.
- Stabilized the JSON help contract: `domain` is now always a string, with
  domain commands exposed under a separate `commands` key.
- Reported unknown commands and actions before option validation, so
  `zw ai bogus --file x` says `UNKNOWN_DOMAIN_ACTION` instead of blaming the
  option.
- Declared every CLI option once in a shared option registry that both the
  parser and per-command validation derive from, with a contract test.
- Quoted generated confirmation commands consistently in `zw plugin remove`
  and `zw dev sync`.
- Consolidated duplicated file-system and Git helpers into `@zaowu-labs/core`
  (`assertSafeOutputPath`, `writeTextFileExclusive`, `readTextFileOrThrow`,
  `isPathEscapingDirectory`) and a shared dev `runGit`.
- Bound `zw ai ask` operation-plan fingerprints to the exact prompt and `--file`
  content sent to the provider, so a prompt or file changed between preview and
  confirmation now invalidates the plan instead of silently sending different
  content over the network.
- Fixed CSV parsing to keep quoted fields that contain newlines as a single
  record instead of tearing them across lines.
- Fixed `zw data analyze` to compute column min/max without spreading large
  numeric columns into argument lists (previously threw a call-stack RangeError
  on very large files).
- Stopped `zw config set` and `zw config migrate` from silently dropping
  unrecognized keys during a full rewrite; they now refuse with an actionable
  error, while surgical YAML edits continue to preserve surrounding keys.
- Fixed `zw teach plan` to keep every heading as a section when the first line of
  the input is plain text instead of a heading.
- Added a protected, manual Trusted Publishing workflow with tag/version validation and provenance.
- Reworked public onboarding around the published npm CLI instead of repository-only commands.
- Added explicit security reporting, support, privacy, and open-core commercialization boundaries.
- Added documentation and support links to root CLI help.

## 1.0.2 - 2026-07-17

- Republished the npm package family with workspace dependencies converted to installable `1.0.2` versions.
- Preserved the `zw` executable mapping in the published CLI package.

## 1.0.1 - 2026-07-17

- Published the first public npm release of the ZaoWu package family.
- Added versioned JSON contracts for `zw ai ask`, `zw ai providers`,
  `zw dev commit`, and `zw dev status`.
- Hardened document/data/AI/automation boundary coverage and release-readiness
  checks.
- Upgraded SheetJS from the vulnerable npm `xlsx@0.18.5` build to the official
  `0.20.3` distribution and cleared production dependency audit findings.
- Hardened web request failures and bounded fetch response reporting.
- Added default timeouts for confirmed web requests and response body reads.
- Stopped native streaming web responses at a bounded download limit and exposed
  whether the observed body length is exact.
- Restored the foundation safety boundary that keeps all automation shell steps blocked.
- Classified Ollama as an HTTP-backed provider that requires preview and confirmation.
- Restored the non-streaming OpenAI Responses API adapter and disclosed resolved AI endpoints.
- Stabilized `zw ai ask --json` endpoint and provider usage fields for preview
  and confirmed responses.
- Hardened YAML config serialization and bound config confirmation fingerprints to values.
- Expanded `zw dev sync` operation plans to disclose fetch, hard reset, and origin access.
- Added a second `--discard-local` acknowledgement when `zw dev sync --yes`
  would discard tracked changes or local commits ahead of the remote branch.
- Added structured, confirmation-gated automation `writeFile` steps confined to
  the real workflow directory, with overwrite and linked-directory escape
  protection.
- Added line ranges and line-specific findings to developer review output.
- Added semantic data schema inference for calendar dates, percentages, and
  common currency values without changing source values.
- Preserved HTML heading and lightweight table structure during document text
  extraction.
- Added Ollama and Anthropic response fixtures and stricter Anthropic output
  validation.
- Removed the public mock plugin-command execution API; plugin support remains
  limited to local manifest validation and lifecycle management.
- Added a practical release checklist and automated release-document checks.
- Disabled automatic web redirects so confirmed requests stay on the disclosed target.
- Fixed numeric analysis so partially numeric text is not treated as a number.
- Bound generated file content into CLI operation-plan fingerprints for init,
  config, document conversion, and data cleaning previews.
- Tightened AI provider response parsing so empty successful outputs are treated
  as invalid provider responses.
- Rejected missing option values such as `--output --json` with a structured
  `OPTION_VALUE_REQUIRED` error instead of silently ignoring the option.
- Rejected invalid constrained option values such as unsupported `--format`,
  non-numeric `--rows`, or out-of-range `--count` with structured
  `OPTION_VALUE_INVALID` errors.
- Rejected unsupported or misspelled command options with a structured
  `OPTION_UNSUPPORTED` error instead of silently ignoring them.
- Bound plugin install/remove operation plans to local target state, and bound
  `zw dev sync` confirmations to the current HEAD and Git status digest.
- Rejected linked plugin directories so install, list, and remove operations
  cannot escape the project `.zaowu/plugins` boundary.
- Added structured automation execution receipts while preserving the existing
  human-readable executed/skipped output.
- Documented `--plan-fingerprint` in `zw init --help` and `--count` in
  `zw teach quiz --help`.
