# Getting Started

This guide is for local development of ZaoWu while the CLI foundation is still
private to the repository.

## Requirements

- Node.js 20.19.0 or newer
- pnpm `>=10.34.1 <11`
- Git

Use Corepack so pnpm follows the version pinned in `package.json`:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
```

## Build And Run

Build all packages:

```bash
corepack pnpm build
```

Run the local CLI entry point:

```bash
node packages/cli/dist/index.js --help
```

Until packaging is added, treat this command as the local `zw` equivalent:

```bash
node packages/cli/dist/index.js <command>
```

## First Project

Preview config creation:

```bash
node packages/cli/dist/index.js init
```

Create `zw.yml` only when confirmed:

```bash
node packages/cli/dist/index.js init --yes
```

Check the environment and config:

```bash
node packages/cli/dist/index.js doctor
node packages/cli/dist/index.js config validate
```

## Common Workflows

Ask through the local provider without network access:

```bash
node packages/cli/dist/index.js ai ask "Explain this project"
node packages/cli/dist/index.js ai ask "Summarize" --file README.md
node packages/cli/dist/index.js ai providers
```

Review Git state without modifying it:

```bash
node packages/cli/dist/index.js dev status
node packages/cli/dist/index.js dev review
node packages/cli/dist/index.js dev review --staged
node packages/cli/dist/index.js dev commit
```

Work with supported documents:

```bash
node packages/cli/dist/index.js doc summary README.md
node packages/cli/dist/index.js doc outline README.md
node packages/cli/dist/index.js doc search README.md install
```

Work with CSV or TSV data:

```bash
node packages/cli/dist/index.js data inspect sample.csv
node packages/cli/dist/index.js data schema sample.csv
node packages/cli/dist/index.js data sample sample.csv --rows 3
node packages/cli/dist/index.js data clean sample.csv --output clean.csv
node packages/cli/dist/index.js data clean sample.csv --output clean.csv --yes
```

Validate and preview automation workflows:

```bash
node packages/cli/dist/index.js auto validate workflow.yml
node packages/cli/dist/index.js auto plan workflow.yml
node packages/cli/dist/index.js auto run workflow.yml
```

Manage local plugin manifests:

```bash
node packages/cli/dist/index.js plugin validate readme-gen
node packages/cli/dist/index.js plugin install readme-gen
node packages/cli/dist/index.js plugin install readme-gen --yes
node packages/cli/dist/index.js plugin list
```

## Safety Defaults

- File writes preview by default.
- Network requests preview by default.
- Plugin install/remove previews by default.
- Automation shell steps are detected but not executed.
- Git commands do not commit, push, reset, or checkout.
- Config rejects secret-like keys such as `token`, `password`, and `apiKey`.

Use `--json` for machine-readable output and `--help` on any command for
command-specific usage.

## Validation

Run these before committing:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test
corepack pnpm lint
corepack pnpm format:check
```

## Common Errors

`ZaoWu config not found.`

Run:

```bash
node packages/cli/dist/index.js init
node packages/cli/dist/index.js init --yes
```

`No staged changes found.`

Run:

```bash
git add <files>
node packages/cli/dist/index.js dev commit
```

`Data format is not supported yet.`

Use `.csv` or `.tsv` for now. XLSX support should be added inside
`packages/data` later.

`Document format is not supported yet.`

Use `.txt`, `.md`, `.markdown`, `.csv`, `.json`, `.yml`, or `.yaml` for now.
PDF and DOCX support should be added inside `packages/doc` later.
