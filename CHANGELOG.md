# ZaoWu Changelog

## Unreleased

No changes yet.

## 1.0.4 - 2026-10-20

- Fixed the release job to build its own fresh checkout, pack all 11 public
  packages with resolved workspace dependencies, and verify their compiled
  entry points, declarations, executables, names, and versions before publishing.
- Published verified tarball paths through npm directly, replacing the pnpm
  publish invocation that failed with EUSAGE before uploading any 1.0.3 package.
- Added six artifact regression cases and an artifact verification gate to both
  the CI matrix and local release verification.
- Carried forward all CLI safety fixes and the explicitly approved, expiring
  dependency exception from the 1.0.3 candidate. The failed v1.0.3 tag is retained
  without modification; no 1.0.3 packages were published to npm.

## 1.0.3 - 2026-10-20

- Hardened Git sync against missing/different upstreams, rewritten origin history,
  obstructing untracked or ignored files, detached HEAD, and ref-name ambiguity.
  Confirmation fingerprints bind staged and working-copy contents, and local
  state is rechecked after fetch.
- Rejected AI provider redirects and bounded both response-header and JSON-body
  reads; malformed provider payloads now use stable errors.
- Preserved YAML scalar boundaries, comments, multiline/empty values, and unknown
  config keys; rejected non-object JSON config and handled recursive aliases.
- Preserved JSON dataset values when headers are normalized and treated absent
  prototype-named fields as missing data.
- Updated the compatible XML parser patch to 0.8.15, clearing all eight high-severity
  dependency advisories in the reviewed lockfile.
- Added 41 regression cases and refreshed command specs, contracts, and documentation.
- Added a production audit policy with seven gate tests and one maintainer-approved,
  path/version-specific sprintf-js exception expiring on 2026-11-19. CI and the
  release workflow retain full audit coverage and reject all other findings.
- Pinned the reviewed Mammoth library version and made packed CLI version
  verification derive from the release manifest.

- Made `zw ai ask` honor `ai.provider` from the resolved project config when
  `--provider` is absent, matching `zw dev --ai` and `zw doctor`; previously it
  silently fell back to the local echo provider. The preview confirm command
  now pins the resolved provider id explicitly.
- Restored CI installs by recording the `xlsx` CDN tarball's integrity hash in
  the lockfile; pnpm now refuses URL-tarball entries without one.
- Stopped classifying files that merely end in `package.json` (for example
  `my-package.json`) as dependency changes in `zw dev commit` type inference
  and `zw dev review` findings; only real package manifests and the root
  lockfile count now, matching the file-category and scope logic.
- Routed `zw init` flag handling through the shared argument parser, so
  `--dry-run=1` can no longer be ignored (writing despite a requested preview)
  and `--yes` after the `--` separator can no longer confirm a write.
- Titled `zw config show` human output `ZaoWu Config Show`, matching its help
  text and command contract.
- Added macOS to the CI matrix alongside Ubuntu and Windows.
- Supported the standard `--` end-of-options separator so targets beginning
  with dashes stay expressible, and hardened option parsing edge cases.
- Derived command-contract sensitivity from each domain package's own command
  declaration instead of a second hand-maintained boolean table, and added a
  contract test keeping every command's help text in exact sync with its
  supported option list.
- Refused `zw data clean` on JSON input instead of silently converting it to
  CSV output.
- Decoded numeric HTML entities (`&#233;`, `&#x2014;`) during document text
  extraction, and reported a missing mammoth markdown capability as an
  actionable error instead of "file was not readable".
- Kept dotted names and decimals (`Node.js`, `3.14`) whole when splitting
  teaching material into sentences.
- Honored the response `Content-Type` charset when decoding streamed web
  bodies, with UTF-8 fallback for unknown labels.
- Added direct tests for the Windows command sanitizer and CLI version
  resolution.
- Capped AI provider retry waits at 30 seconds so a server-controlled
  `Retry-After` header can no longer stall the CLI indefinitely.
- Fixed dormant shell-safety rules for standalone `base64 -d`/`--decode` and
  `del -s`/`rd -recurse` flags that a word-boundary regex could never match.
- Classified test-only staged changes as `test` commits; the previous check
  order made that branch unreachable for tests under `src/`.
- Stopped classifying leading-zero identifiers (ZIP codes, SKUs) and hex text
  as numbers in data schema inference and numeric analysis.
- Flushed the streaming text decoder when a web response hits the download
  cap, so a trailing multibyte character is no longer dropped.
- Reported empty XLSX sheets with zero removed rows instead of a negative
  count, and read BOM-prefixed plugin manifests consistently in `plugin list`.
- Verified the capability matrix's safety columns (reads, writes, Git, shell,
  network, secrets, safety mode) against each domain's capability ledger and
  the sensitive-command contracts, instead of only checking command names.
- Corrected capability disclosures the new check surfaced: `zw teach` commands
  read optional topic files, and the dev domain ledger now declares fixed Git
  subprocess execution and repository reads.
- Type-checked and linted test files (previously excluded from both gates) and
  made lint warnings fail the build.
- Added CI steps for source-structure limits, test type-checking, and
  production dependency audits, plus weekly Dependabot updates.
- Wired test coverage collection with floor thresholds so the existing
  coverage configuration actually runs.
- Added a `ZAOWU_DEBUG` escape hatch that surfaces the underlying stack trace
  for unexpected internal errors in human output while keeping JSON error
  output contract-stable.
- Derived the doctor command-surface count from the shared root-surface list
  instead of a hand-synced constant.
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
