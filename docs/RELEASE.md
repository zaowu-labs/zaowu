# ZaoWu Release Readiness

ZaoWu is not ready for public npm publishing yet. This document defines the
foundation checks that must pass before any future release work starts.

## Current Gate

Run:

```bash
corepack pnpm verify
```

The gate includes:

- TypeScript build
- schema/example validation
- generated PDF/DOCX/XLSX fixture checks
- CLI smoke checks
- package tests
- lint and format checks
- release metadata checks
- package dry-run
- packed CLI install smoke

The release metadata check is:

```bash
corepack pnpm verify:release
```

It verifies:

- root package stays private
- canonical repository and homepage point to `zaowu-labs/zaowu`
- Node.js and pnpm engine policy stays pinned
- package names, versions, license, ESM exports, files, and keywords stay aligned
- workspace package dependencies use `workspace:*`
- only `@zaowu/cli` exposes the `zw` binary

## Not Yet Ready

Do not publish packages until these are intentionally designed:

- versioning and changelog policy
- release branch/tag policy
- npm provenance and publish permissions
- package-level README content
- public support policy
- backward compatibility policy for command JSON output

## Manual Preflight

Before any future publish attempt:

```bash
git remote -v
corepack pnpm install --frozen-lockfile
corepack pnpm verify
git diff --check
```

The remote must point to:

```text
https://github.com/zaowu-labs/zaowu.git
```

Publishing to a personal fork is out of scope unless explicitly requested.
