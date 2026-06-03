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
- `zw init`
- `zw doctor`
- safe first-version domain commands
- command-specific help and JSON output

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
pnpm --filter @zaowu/cli build
node packages/cli/dist/index.js --help
```

### `zw init`

Preview the default config file without writing it.

```bash
node packages/cli/dist/index.js init
```

Create `zw.yml` only when explicitly confirmed:

```bash
node packages/cli/dist/index.js init --yes
```

Preview as JSON:

```bash
node packages/cli/dist/index.js init --json
```

### `zw doctor`

Check local environment health.

```bash
node packages/cli/dist/index.js doctor
node packages/cli/dist/index.js doctor --json
```

The doctor command checks Node.js 20.19.0 or newer, Git, pnpm `>=10.34.1 <11`
or Corepack-provided pnpm, and the nearest ZaoWu config file.

### Domain Commands

Top-level domains now have safe first-version commands:

```bash
node packages/cli/dist/index.js ai providers
node packages/cli/dist/index.js dev status
node packages/cli/dist/index.js doc outline README.md
node packages/cli/dist/index.js data schema sample.csv
node packages/cli/dist/index.js auto plan workflow.yml
node packages/cli/dist/index.js plugin validate readme-gen
```

Use `--help` on any domain or action:

```bash
node packages/cli/dist/index.js data --help
node packages/cli/dist/index.js data schema --help
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
packages/core     Shared error, domain, and core types
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
