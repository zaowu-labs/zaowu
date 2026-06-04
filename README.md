# ZaoWu / 造物

ZaoWu is an open-source AI-powered toolkit for development, automation, documents, data, teaching, plugins, and workflows.

The command-line entry point is:

```bash
zw
```

## Current Phase

ZaoWu is in the first runnable foundation phase. The repository is focused on:

- experience rules
- monorepo structure
- a coherent `zw` CLI
- standard user-facing errors
- a stable error-code registry
- versioned config with migration preview
- `zw init`
- `zw doctor`
- safe first-version domain commands
- command-specific help and JSON output
- command contract tests
- capability ledgers and operation plans for sensitive commands
- a local echo AI provider plus preview-first non-streaming OpenAI adapter
- first-pass PDF, DOCX, CSV, TSV, and XLSX support

Later modules should build on this foundation instead of becoming separate scripts:

- AI providers
- document processing
- data analysis
- teaching tools
- plugins

## Repository

Canonical repository:

```text
https://github.com/zaowu-labs/zaowu
```

Check the local remote before pushing:

```bash
git remote -v
```

Expected output should point to:

```text
https://github.com/zaowu-labs/zaowu.git
```

## Commands

### `zw --help`

Show available commands and global options.

```bash
corepack pnpm build
corepack pnpm --silent zw --help
```

### `zw init`

Preview the default config file without writing it.

```bash
corepack pnpm --silent zw init
```

Create `zw.yml` only when explicitly confirmed:

```bash
corepack pnpm --silent zw init --yes
```

Preview as JSON:

```bash
corepack pnpm --silent zw init --json
```

### `zw doctor`

Check local environment health.

```bash
corepack pnpm --silent zw doctor
corepack pnpm --silent zw doctor --json
```

The doctor command checks Node.js 20.19.0 or newer, Git, pnpm `>=10.34.1 <11`
or Corepack-provided pnpm, and the nearest ZaoWu config file.

### Domain Commands

Top-level domains now have safe first-version commands:

```bash
corepack pnpm --silent zw ai providers
corepack pnpm --silent zw dev status
corepack pnpm --silent zw doc outline README.md
corepack pnpm --silent zw data schema sample.csv
corepack pnpm --silent zw auto plan workflow.yml
corepack pnpm --silent zw plugin validate readme-gen
```

Use `--help` on any domain or action:

```bash
corepack pnpm --silent zw data --help
corepack pnpm --silent zw data schema --help
```

See the full catalog in `docs/experience/COMMAND_CATALOG.md`.

## Development

Use Node.js 20.19.0 or newer and pnpm `>=10.34.1 <11`. Corepack will use the
pinned pnpm version from `package.json`.

```bash
corepack enable
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```

Do not run dependency installation, commits, pushes, or destructive actions unless the user explicitly asks for them.

## Continuous Integration

Pull requests run the foundation checks on Ubuntu and Windows with Node.js 20.19.0 and 24.x:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test
corepack pnpm lint
corepack pnpm format:check
```

## Project Structure

```text
packages/cli      Minimal `zw` command-line interface
packages/core     Shared errors, error codes, capabilities, domains, and core types
packages/config   Config discovery and loading helpers
packages/ai       AI provider abstraction scaffold
packages/dev      Developer workflow scaffold
packages/doc      Document workflow scaffold
packages/data     Data workflow scaffold
packages/auto     Automation workflow scaffold
packages/web      Web workflow scaffold
packages/teach    Teaching workflow scaffold
packages/plugin   Plugin workflow scaffold
docs/experience   Product and command experience specs
```

Long-term structure and workflow docs:

```text
docs/GETTING_STARTED.md  Local setup, common commands, and common errors
docs/ARCHITECTURE.md  Package boundaries, dependency direction, and command rules
docs/ROADMAP.md       Preferred phase order for growing ZaoWu
docs/CONTRIBUTING.md  Development workflow, safety rules, and validation
docs/ERROR_CODES.md   Stable user-facing error code registry
docs/FOUNDATION.md    Foundation invariants and future workflow rules
docs/experience/COMMAND_CATALOG.md  First-version command behavior and limits
```

## Experience Rules

Feature commands should follow:

```bash
zw <domain> <action> [target] [options]
```

Root lifecycle commands are limited to setup and diagnostics:

```bash
zw init
zw doctor
zw --help
zw --version
```

Default output should be human-readable. Use `--json` for valid machine-readable output.
