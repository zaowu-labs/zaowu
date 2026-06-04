# Contributing to ZaoWu

ZaoWu should grow as one coherent CLI product. This guide defines the workflow
for adding or changing commands.

## Before Starting

Confirm the repository target:

```bash
git remote -v
```

The canonical remote is:

```text
https://github.com/zaowu-labs/zaowu.git
```

Use Node.js 20.19.0 or newer and pnpm `>=10.34.1 <11`.

## Development Setup

```bash
corepack enable
corepack pnpm install
```

If `corepack enable` cannot write system shims on the machine, use
`corepack pnpm` directly.

## Adding a Command

Use this process for every important command:

1. Choose the command shape.
2. Confirm the domain owner.
3. Create or update a spec under `docs/experience/`.
4. Implement behavior in the owning package.
5. Wire the command through `packages/cli`.
6. Register or update the command contract if the command is user-facing.
7. Add or update stable error codes for new expected failures.
8. Add focused tests.
9. Update README or related docs.
10. Run validation.

Command shape:

```bash
zw <domain> <action> [target] [options]
```

Root commands are only for lifecycle and diagnostics:

```bash
zw init
zw doctor
zw --help
zw --version
```

## Package Rules

Keep `packages/cli` thin. It should parse arguments, route commands, format
output, and set exit codes.

Domain behavior belongs in the owning package:

```text
packages/dev   Developer workflows
packages/doc   Document workflows
packages/data  Data workflows
packages/auto  Automation workflows
```

Shared behavior belongs in `packages/core`, `packages/config`, or `packages/ai`
only when it is genuinely shared and stable.

Domain packages should not import each other directly. If two domains need a
shared concept, promote only the stable generic part to `packages/core`; keep the
rest in the owning domain.

## Safety Rules

Sensitive actions include:

- writing files
- deleting files
- modifying Git state or Git history
- running shell commands
- accessing secrets
- sending network requests
- installing dependencies
- changing system-level configuration

Sensitive actions must support preview, confirmation, or `--dry-run`.
Destructive actions should require confirmation by default.

Do not silently overwrite user files.

Sensitive JSON output should include an `operationPlan` when practical. The plan
should make schema version, reads, writes, deletes, execution, network requests,
secrets, risk, and confirmation requirements visible before the command performs
sensitive work.

## Output Rules

Default output should be human-readable.

When `--json` is used:

- output valid JSON
- do not print extra prose
- include stable keys
- include status fields where possible

Expected errors should be actionable and should not show raw stack traces by
default.

## Tests

New behavior should include tests where practical.

At minimum, cover:

- happy path
- missing input
- invalid input
- important error paths
- `--json` output if supported
- `--dry-run` behavior if supported

## Validation

Run the full suite before finishing:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test
corepack pnpm lint
corepack pnpm format:check
corepack pnpm pack:check
```

For CLI changes, also run manual checks, for example:

```bash
corepack pnpm --silent zw doctor
corepack pnpm --silent zw doctor --json
```

## Pull Requests

Pull requests should describe:

- what changed
- why it changed
- user or developer impact
- validation commands
- known risks or follow-up work

Keep PRs scoped. Do not mix product design changes with unrelated refactors.
