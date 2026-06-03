# ZaoWu Roadmap

This roadmap keeps ZaoWu focused while the foundation is still young. It is not a
release promise. It is the preferred order of work.

## Phase 1: Foundation

Goal: make the repository dependable before adding many tools.

Status: first runnable version in progress.

Scope:

- experience rules
- pnpm workspace
- minimal `zw` CLI
- standard user-facing errors
- `zw init`
- `zw doctor`
- CI on Ubuntu and Windows
- architecture and contribution rules
- top-level domain package scaffolds
- domain help and planned-command guardrails
- first safe MVP commands across config, ai, dev, doc, data, auto, plugin, teach, and web

Exit criteria:

- CI is stable on supported Node.js versions.
- `zw init` and `zw doctor` have specs, tests, and documentation.
- Command boundaries are documented.
- New contributors can see where a new command belongs.
- First-version commands are safe by default and documented in the command catalog.

## Phase 2: Config System

Goal: make project configuration stable and safe.

Scope:

- `zw.yml` schema
- config validation
- default config shape
- config error messages
- JSON output for config-related diagnostics

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

Out of scope:

- agents
- provider marketplaces
- complex memory systems
- long-running autonomous tasks

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

- CSV and spreadsheet validation
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
zw auto validate workflow.yml
zw auto run workflow.yml --dry-run
zw auto run workflow.yml --yes
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
corepack pnpm build
corepack pnpm test
corepack pnpm lint
corepack pnpm format:check
```

Any command behavior change should also include manual CLI verification.
