# ZaoWu / 造物

ZaoWu is an open-source AI-powered toolkit for development, automation, documents, data, teaching, plugins, and workflows.

The command-line entry point is:

```bash
zw
```

## Current Phase

ZaoWu is in the early foundation phase. The repository is focused on:

- experience rules
- monorepo structure
- a minimal `zw` CLI
- standard user-facing errors
- `zw init`
- `zw doctor`

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

The doctor command checks Node.js, Git, pnpm or Corepack-provided pnpm, and the nearest ZaoWu config file.

## Development

Use Node.js 20.11.0 or newer. Corepack will use the pinned pnpm version from `package.json`.

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

Pull requests run the foundation checks on Ubuntu and Windows with Node.js 20.11.0 and 24.x:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test
corepack pnpm lint
corepack pnpm format:check
```

## Project Structure

```text
packages/cli     Minimal `zw` command-line interface
packages/core    Shared error and core types
packages/config  Config discovery and loading helpers
packages/ai      Empty registry for the future AI provider abstraction
docs/experience  Product and command experience specs
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
