# Getting Started

This guide starts with the published CLI. Repository development instructions are provided separately below.

## Requirements

- Node.js 20.19.0 or newer
- Git for developer commands
- pnpm is only required for repository development; doctor reports it as optional for CLI use.

## Install

```bash
npm install -g @zaowu-labs/cli@1.0.6
zw --version
zw doctor
```

To try the CLI without installing globally:

```bash
npx --package @zaowu-labs/cli@1.0.6 zw --help
```

### npm 12: `EALLOWREMOTE`

npm 12 disables remote URL dependencies by default. ZaoWu's XLSX support uses
SheetJS 0.20.3, pinned to its official distribution:
<https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz>.

If installation reports `EALLOWREMOTE`, allow URL dependencies for that command:

```bash
npm install -g --allow-remote=all @zaowu-labs/cli@1.0.6
zw --version
zw doctor --json
```

For a single invocation:

```bash
npx --allow-remote=all --package @zaowu-labs/cli@1.0.6 zw --help
```

`--allow-remote=all` permits URL dependencies for that command, without changing
global npm configuration. Review the pinned URL before opting in. See npm's
[`allow-remote` policy](https://docs.npmjs.com/cli/using-npm/config/#allow-remote).

## First Project

Preview config creation:

```bash
zw init
```

Create `zw.yml` only when confirmed:

```bash
zw init --yes
```

Check the environment and config:

```bash
zw doctor
zw config validate
zw config migrate
```

## Prepare local inputs

From an empty demo directory, create small document and table inputs:

```bash
node -e "require('node:fs').writeFileSync('zaowu-demo.md', '# Project notes\n\n## Tasks\nReview the release.\n', {flag:'wx'})"
node -e "require('node:fs').writeFileSync('zaowu-demo.csv', 'name,amount\nalpha,12\nbeta,18\n', {flag:'wx'})"
zw doc outline zaowu-demo.md
zw data schema zaowu-demo.csv
zw data sample zaowu-demo.csv --rows 1 --json
```

Existing files are preserved. Document output lists headings, the table schema
identifies text and numeric columns, and the sample JSON contains one data row.
These operations read the inputs without writing results or using a model.

## Common Workflows

Inspect input through the local Echo demonstration provider (no model inference):

```bash
zw ai ask "Explain this project" --provider echo
zw ai ask "Show input" --file zaowu-demo.md --provider echo
zw ai providers
```

Use OpenAI only through environment variables:

For bash/zsh, set `export OPENAI_API_KEY="your-key"`. For PowerShell, use
`$env:OPENAI_API_KEY="your-key"`. Then preview before confirming:

```bash
zw ai ask "Explain ZaoWu" --provider openai
zw ai ask "Explain ZaoWu" --provider openai --yes
```

Do not put API keys or tokens in `zw.yml`.
Network providers preview by default, require `--yes`, and are additionally
guarded inside `packages/ai` so internal callers cannot bypass confirmation.
The preview reads any `--file` input and reports combined input size before a
network request can be sent.

Ollama also uses HTTP, even when it runs on localhost, so it follows the same
preview-first rule:

```bash
zw ai ask "Explain ZaoWu" --provider ollama
zw ai ask "Explain ZaoWu" --provider ollama --yes
```

Review Git state without modifying it:

```bash
zw dev status
zw dev review
zw dev review --staged
zw dev commit
zw dev sync
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
zw doc summary zaowu-demo.md
zw doc outline zaowu-demo.md
zw doc search zaowu-demo.md Tasks
```

Work with CSV, TSV, or XLSX data. XLSX reads the first worksheet by default and
supports `--sheet <name>` when a workbook has multiple sheets:

```bash
zw data inspect zaowu-demo.csv
zw data inspect workbook.xlsx --sheet Q1
zw data schema zaowu-demo.csv
zw data sample zaowu-demo.csv --rows 3
zw data clean zaowu-demo.csv --output clean.csv
zw data clean zaowu-demo.csv --output clean.csv --yes
```

Blank and duplicate headers are normalized to stable names such as `column_3`
and `name_2` before schema or sample JSON is produced.
Schema inference also recognizes valid calendar dates, percentages, and common
currency values while preserving the original cell text.

The `examples/` paths below require a repository checkout. Installed CLI users
can substitute their own workflow or plugin manifest paths. Validate and preview
automation workflows:

```bash
zw auto validate examples/workflows/message.yml
zw auto plan examples/workflows/message.yml
zw auto run examples/workflows/message.yml
zw auto plan examples/workflows/write-file.yml
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
zw plugin validate examples/plugins/hello
zw plugin validate readme-gen
zw plugin install readme-gen
zw plugin install readme-gen --yes
zw plugin list
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

## Repository development

Contributors need pnpm `>=10.34.1 <11` through Corepack. From a repository checkout:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm --silent zw --help
```

In this checkout, substitute `corepack pnpm --silent zw` for `zw` in the examples
above. Published CLI users can run the `zw` examples directly.

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
zw init
zw init --yes
```

`No staged changes found.`

Run:

```bash
git add <files>
zw dev commit
```

`Data format is not supported yet.`

Use `.csv`, `.tsv`, `.json`, or `.xlsx`. XLSX reads the first worksheet by default; pass
`--sheet <name>` when you need a specific worksheet.

`Document format is not supported yet.`

Use `.txt`, `.md`, `.markdown`, `.csv`, `.json`, `.yml`, `.yaml`, `.html`,
`.htm`, `.pdf`, or `.docx`. PDF and DOCX are extracted as text.

`Workflow format is not supported yet.`

Use `.json`, `.yml`, or `.yaml` workflow files for `zw auto`.

## Command recovery

- `zw help <domain> <action>` and `zw <domain> <action> -h` show the same help.
- `-V` shows the version. Short aliases stop being options after a literal `--`.
- Boolean flags have no assigned values. Omit `--yes` to preview; writing
  `--yes=false` or `--dry-run=1` returns `OPTION_VALUE_INVALID` before execution.
- Extra targets return `ARGUMENT_UNEXPECTED`. For example, use
  `zw data clean input.csv --output output.csv`, rather than two positional paths.
- Quote a multiword config value: `zw config set project.name "My project"`.
  Config write and migration previews print a copyable command with a fingerprint.
- Confirmation commands use POSIX shell quoting on macOS/Linux and PowerShell
  quoting on Windows. Literal prompt text follows `--` so option-like text stays
  input.
- Invalid project/global configuration is reported rather than silently choosing
  Echo. `--provider` explicitly overrides provider preferences. Without a project
  config, AI commands can still use an optional global preference; doctor checks
  that same provider.
