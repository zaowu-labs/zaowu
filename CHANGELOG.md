# ZaoWu Changelog

## Unreleased

- No unreleased changes.

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
