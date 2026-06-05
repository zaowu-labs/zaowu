# ZaoWu Roadmap

This roadmap keeps ZaoWu focused while the foundation is still young. It is not a
release promise. It is the preferred order of work.

## Phase 1: Foundation

Goal: make the repository dependable before adding many tools.

Status: first runnable version established and being hardened.

Scope:

- experience rules
- pnpm workspace
- minimal `zw` CLI
- standard user-facing errors
- stable error-code registry
- `zw init`
- `zw doctor`
- CI on Ubuntu and Windows
- architecture and contribution rules
- top-level domain package scaffolds
- domain help and planned-command guardrails
- safe MVP commands across config, ai, dev, doc, data, auto, plugin, teach, and web
- action-level help for runnable commands
- config validate/get/set with preview-first writes
- config versioning and migration preview
- command contract tests for root/domain/action help
- CLI smoke and golden-output checks for first-use experience
- schema/example checks for user-authored config, workflow, and plugin inputs
- generated rich fixture checks for PDF, DOCX, and XLSX command paths
- JSON contract checks for versioned machine-readable command output
- command-output schemas for the first versioned JSON contracts
- release metadata readiness checks before package dry-run
- package-level README files included in release metadata checks
- release policy and changelog preflight checks before publish work
- packed CLI install smoke for release-facing command availability
- package boundary guard for domain packages
- capability ledgers and operation plans for sensitive commands
- local AI provider listing and explicit file input
- non-streaming OpenAI provider adapter behind `packages/ai` with explicit
  network confirmation, shared preview, timeout, and input-size guardrails
- developer status/review/commit previews with change categories, diff hunk
  summaries, deterministic risk signals, and recommended checks
- document outline/search, frontmatter extraction, PDF, and DOCX text extraction
- data schema/sample, clean metadata, and XLSX first-sheet or named-sheet
  support with stable normalized headers
- automation planning with variable checks, workflow version warnings, and
  explicit execution policy decisions plus a blocked execution sandbox
- automation execution rules documented before shell execution is enabled
- local plugin manifest validation with schema version and command checks
- user-facing examples and JSON Schemas kept outside runtime packages

Exit criteria:

- CI is stable on supported Node.js versions.
- `zw init` and `zw doctor` have specs, tests, and documentation.
- Command boundaries are documented.
- New contributors can see where a new command belongs.
- First-version commands are safe by default and documented in the command catalog.
- New users can follow `docs/GETTING_STARTED.md` from install to validation.
- Error codes, command help, package boundaries, and sensitive operation plans
  are covered by automated tests.
- Package contents are checked with `pack --dry-run` before release-facing
  changes are considered ready.
- Release-facing package metadata is checked before package dry-run.
- Packed CLI installation is smoke-tested in a temporary project before
  release-facing changes are considered ready.
- The built CLI smoke path covers init, doctor, AI preview, data, document,
  automation, plugin, and web preview commands.

## Phase 2: Config System

Goal: make project configuration stable and safe.

Scope:

- `zw.yml` schema
- config validation
- default config shape
- config error messages
- JSON output for config-related diagnostics
- preview-first config writes for supported non-secret keys
- migration preview and canonical config serialization

Out of scope:

- storing secrets in config
- remote config sync
- user accounts

## Phase 3: AI Provider Abstraction

Goal: let feature packages use AI without depending on a concrete provider.

Scope:

- provider registry
- model request and response types
- provider config resolution
- provider error mapping
- non-streaming text generation first
- transparent prompt and file input reporting
- OpenAI adapter through the Responses API

Out of scope:

- agents
- provider marketplaces
- complex memory systems
- long-running autonomous tasks
- tool-calling and streaming until the non-streaming surface is stable

## Phase 4: Developer Workflows

Goal: add the first high-value technical creator tools.

Preferred order:

```bash
zw dev commit
zw dev review
```

Scope:

- Git repository checks
- diff collection
- preview-first commit message generation
- review output in human and JSON forms
- safe handling of Git state

Sensitive behavior:

- Commands that modify Git state must require confirmation or an explicit flag.
- Review commands should not write files by default.

## Phase 5: Document Workflows

Goal: add practical document tools without mixing them into developer workflows.

Preferred examples:

```bash
zw doc summary report.pdf
zw doc extract report.pdf
zw doc convert input.docx
```

Scope:

- input validation
- document extraction
- summaries and structured outputs
- JSON output when requested
- PDF and DOCX text extraction

Out of scope:

- data analysis commands
- Git commands
- automation runners

## Phase 6: Data Workflows

Goal: add table and dataset workflows under a clear data domain.

Preferred examples:

```bash
zw data inspect sales.xlsx
zw data analyze sales.xlsx
zw data clean input.csv
```

Scope:

- CSV, TSV, and XLSX validation with explicit worksheet selection
- basic profiling
- readable summaries
- JSON output for automation

Out of scope:

- document conversion
- Git review
- workflow scheduling

## Phase 7: Automation

Goal: run explicit workflows safely.

Preferred examples:

```bash
zw auto validate examples/workflows/message.yml
zw auto run examples/workflows/message.yml --dry-run
zw auto run examples/workflows/message.yml --yes
```

Scope:

- workflow validation
- dry-run previews
- explicit confirmation for execution
- clear logs

Out of scope:

- hidden autonomous execution
- background agents
- system-level changes without confirmation

## Phase 8: Plugins

Goal: allow extension only after the core product is stable.

Preferred examples:

```bash
zw plugin list
zw plugin install readme-gen
zw plugin remove readme-gen
```

Scope:

- local plugin metadata
- safe installation flow
- compatibility checks

Out of scope:

- public plugin marketplace
- remote trust model
- automatic plugin execution

## Ongoing Quality Bar

Every phase should keep these checks healthy:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm verify
```

Any command behavior change should also include manual CLI verification.
