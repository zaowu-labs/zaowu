# ZaoWu Foundation

This document defines the foundation rules that should stay true while ZaoWu
grows.

## Foundation Invariants

1. One product entry point: all user-facing features start with `zw`.
2. One command grammar: feature commands use `zw <domain> <action> [target] [options]`.
3. One owner per domain: behavior lives in the owning package under `packages/`.
4. One shared safety model: sensitive commands preview by default or require
   explicit confirmation.
5. One error system: expected failures use stable error codes from
   `packages/core/src/error-codes.ts`.
6. One config lifecycle: `zw.yml` is versioned and future rewrites go through
   `zw config migrate`.
7. One AI boundary: model providers live behind `packages/ai`.
8. One verification loop: build, test, lint, format, package dry-run, and
   manual CLI checks run before a change is considered finished.

## Separation Rules

Domain packages should not import each other directly:

```text
packages/doc      document behavior only
packages/data     table and dataset behavior only
packages/dev      Git and developer behavior only
packages/auto     explicit workflow behavior only
packages/plugin   local plugin manifest behavior only
packages/web      web request behavior only
packages/teach    teaching behavior only
packages/ai       provider behavior only
packages/config   config behavior only
```

Shared code is allowed only when it is stable and generic:

```text
packages/core     errors, codes, capabilities, domains, small helpers
packages/config   config lifecycle
packages/ai       provider interfaces
```

When a new feature seems to cross domains, split it into domain-owned pieces and
wire them from `packages/cli`. Do not hide cross-domain coupling inside a helper.

## Capability Ledger

Every domain declares what it can do:

- read files
- write files
- modify Git
- execute shell commands
- use network
- access secrets
- install dependencies
- change system configuration

This ledger is not a permission system yet. It is the product-level accounting
that keeps future tools honest and discoverable.

## Operation Plans

Sensitive commands should expose an operation plan in JSON output and human
output when practical. A plan should include:

- risk: `low`, `medium`, or `high`
- schema version
- confirmation requirement
- reads
- writes
- deletes
- execution
- network targets
- secrets
- notes

The goal is simple: before ZaoWu does sensitive work, the user should be able to
see what will happen.

## Adding Future Work

Use this order for new commands or major behavior:

1. Update or create a spec under `docs/experience/`.
2. Choose the owning package.
3. Add expected error codes in `packages/core/src/error-codes.ts`.
4. Implement domain behavior in the owning package.
5. Route through `packages/cli`.
6. Add or update the command contract registry.
7. Add tests for human output, JSON output, error paths, and preview behavior.
8. Update README, Getting Started, and the command catalog.
9. Run the full validation suite.
10. Run manual CLI checks.

## Validation Loop

Run these before committing:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test
corepack pnpm lint
corepack pnpm format:check
corepack pnpm pack:check
git diff --check
```

For CLI behavior, also run direct commands through the workspace binary:

```bash
corepack pnpm --silent zw --help
corepack pnpm --silent zw doctor --json
corepack pnpm --silent zw config validate --json
```
