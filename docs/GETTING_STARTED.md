# Getting Started

This guide starts with the published CLI. Repository development instructions are provided separately below.

## Requirements

- Node.js 20.19.0 or newer
- Git

## Install

```bash
npm install -g @zaowu-labs/cli@1.0.5
zw --version
zw doctor
```

To try the CLI without installing globally:

```bash
npx --package @zaowu-labs/cli@1.0.5 zw --help
```

## Repository development

Contributors also need pnpm `>=10.34.1 <11`. Use Corepack so the workspace follows the pinned version:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm --silent zw --help
```

The direct Node entry point is still useful for low-level debugging:

```bash
node packages/cli/dist/index.js <command>
```

## First Project

Preview config creation:

```bash
corepack pnpm --silent zw init
```

Create `zw.yml` only when confirmed:

```bash
corepack pnpm --silent zw init --yes
```

Check the environment and config:

```bash
corepack pnpm --silent zw doctor
corepack pnpm --silent zw config validate
corepack pnpm --silent zw config migrate
```

## Common Workflows

Ask through the local provider without network access:

```bash
corepack pnpm --silent zw ai ask "Explain this project"
corepack pnpm --silent zw ai ask "Summarize" --file README.md
corepack pnpm --silent zw ai providers
```

Use OpenAI only through environment variables:

```bash
$env:OPENAI_API_KEY="..."
corepack pnpm --silent zw ai ask "Explain ZaoWu" --provider openai
corepack pnpm --silent zw ai ask "Explain ZaoWu" --provider openai --yes
```

Do not put API keys or tokens in `zw.yml`.
Network providers preview by default, require `--yes`, and are additionally
guarded inside `packages/ai` so internal callers cannot bypass confirmation.
The preview reads any `--file` input and reports combined input size before a
network request can be sent.

Ollama also uses HTTP, even when it runs on localhost, so it follows the same
preview-first rule:

```bash
corepack pnpm --silent zw ai ask "Explain ZaoWu" --provider ollama
corepack pnpm --silent zw ai ask "Explain ZaoWu" --provider ollama --yes
```

Review Git state without modifying it:

```bash
corepack pnpm --silent zw dev status
corepack pnpm --silent zw dev review
corepack pnpm --silent zw dev review --staged
corepack pnpm --silent zw dev commit
corepack pnpm --silent zw dev sync
```

Review output includes change categories, diff hunk summaries, deterministic
risk signals, and recommended validation commands so the next check is explicit.
Worktree review lists untracked files by name; stage them when you need full Git
diff context.
`zw dev sync` is different: it fetches `origin` and hard-resets the current
branch to `origin/<branch>`. It previews by default and requires `--yes`; local
tracked changes and diverged local commits can be discarded. When either risk
is present, confirmed execution also requires `--discard-local`. Untracked or
ignored paths that obstruct the reset also require `--discard-local`, because
Git can delete them. Unrelated untracked files remain untouched. Discard risk
is checked again after fetching, against the actual origin branch.

Work with supported documents. Text, Markdown-like files, HTML, PDF, and DOCX
are handled as extracted text in this foundation version. HTML headings and
lightweight table rows retain useful structure:

```bash
corepack pnpm --silent zw doc summary README.md
corepack pnpm --silent zw doc outline README.md
corepack pnpm --silent zw doc search README.md install
```

Work with CSV, TSV, or XLSX data. XLSX reads the first worksheet by default and
supports `--sheet <name>` when a workbook has multiple sheets:

```bash
corepack pnpm --silent zw data inspect examples/data/sales.csv
corepack pnpm --silent zw data inspect workbook.xlsx --sheet Q1
corepack pnpm --silent zw data schema examples/data/sales.csv
corepack pnpm --silent zw data sample examples/data/sales.csv --rows 3
corepack pnpm --silent zw data clean examples/data/sales.csv --output clean.csv
corepack pnpm --silent zw data clean examples/data/sales.csv --output clean.csv --yes
```

Blank and duplicate headers are normalized to stable names such as `column_3`
and `name_2` before schema or sample JSON is produced.
Schema inference also recognizes valid calendar dates, percentages, and common
currency values while preserving the original cell text.

Validate and preview automation workflows:

```bash
corepack pnpm --silent zw auto validate examples/workflows/message.yml
corepack pnpm --silent zw auto plan examples/workflows/message.yml
corepack pnpm --silent zw auto run examples/workflows/message.yml
corepack pnpm --silent zw auto plan examples/workflows/write-file.yml
```

Workflows default to `version: 1`; unsupported explicit versions produce a
warning and remain visible in validation and plan output.
Workflow `permissions` can declare `shell`, `fileWrites`, and `network` as
`blocked` or `prompt`. In this foundation version, shell steps still stay
blocked even when `permissions.shell: prompt` is present. Structured
`writeFile` steps may create a new file only when `fileWrites: prompt` is
declared and the run is confirmed with `--yes`. Absolute paths, parent-directory
escapes, existing targets, and linked directories that resolve outside the
workflow directory are refused. JSON output includes the runtime `policy` and
execution `sandbox`, including the resolved workflow-directory boundary.
`zw auto plan --json` includes per-step `operationPlan` entries so automation
can inspect risk and planned execution before anything runs.

Manage local plugin manifests:

```bash
corepack pnpm --silent zw plugin validate examples/plugins/hello
corepack pnpm --silent zw plugin validate readme-gen
corepack pnpm --silent zw plugin install readme-gen
corepack pnpm --silent zw plugin install readme-gen --yes
corepack pnpm --silent zw plugin list
```

Local plugin manifests may declare `schemaVersion: 1`. Unsupported schema
versions, duplicate command names, and invalid command summaries are reported
before installation from a local source. Plugin commands are not executed in
this foundation version.

## Safety Defaults

- File writes preview by default.
- Confirmed document and data writes refuse to overwrite inputs or existing
  outputs.
- Network requests preview by default.
- Network AI requests preview by default and require `--yes`.
- Plugin install/remove previews by default.
- Confirmed plugin install refuses existing manifests, and confirmed plugin
  remove refuses missing manifests.
- Automation shell steps are detected but not executed. Structured file writes
  are confirmation-gated, sandboxed, and create-only.
- Git status, review, and commit preview are read-only. `zw dev sync --yes`
  performs the explicitly previewed fetch and hard reset only when no discard
  risk exists; otherwise add `--discard-local`.
- Config rejects secret-like keys such as `token`, `password`, and `apiKey`.
- Sensitive JSON outputs include a schema-versioned `operationPlan` that lists
  subjects, reads, writes, deletes, network requests, secrets, execution,
  confirmation requirements, and a stable fingerprint.
- For stricter automation, preview first and confirm with
  `--yes --plan-fingerprint <operationPlan.fingerprint>` so changed plans fail
  before writing files or sending network requests.
- Versioned JSON contracts are documented in `docs/JSON_CONTRACTS.md`; public
  machine output should evolve additively unless the schema version changes.

Use `--json` for machine-readable output and `--help` on any command for
command-specific usage.

## Validation

Run these before committing:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm verify
```

This gate also checks `examples/` against runtime parsers, validates the schema
files, generates temporary PDF/DOCX/XLSX fixtures for CLI checks, and installs
the packed CLI into a temporary project before running `zw`. It also checks
versioned package and CLI JSON contracts against command-output schemas, plus
release-facing package metadata before package dry-run.

Windows:

```powershell
.\scripts\verify-local.ps1
```

macOS or Linux:

```bash
sh ./scripts/verify-local.sh
```

## Common Errors

`ZaoWu config not found.`

Run:

```bash
corepack pnpm --silent zw init
corepack pnpm --silent zw init --yes
```

`No staged changes found.`

Run:

```bash
git add <files>
corepack pnpm --silent zw dev commit
```

`Data format is not supported yet.`

Use `.csv`, `.tsv`, `.json`, or `.xlsx`. XLSX reads the first worksheet by default; pass
`--sheet <name>` when you need a specific worksheet.

`Document format is not supported yet.`

Use `.txt`, `.md`, `.markdown`, `.csv`, `.json`, `.yml`, `.yaml`, `.html`,
`.htm`, `.pdf`, or `.docx`. PDF and DOCX are extracted as text.

`Workflow format is not supported yet.`

Use `.json`, `.yml`, or `.yaml` workflow files for `zw auto`.
