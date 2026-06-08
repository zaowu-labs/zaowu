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
- JSON contract checks for versioned machine output
- CLI smoke checks
- package tests
- lint and format checks
- release metadata checks
- package dry-run
- packed CLI install smoke
- release policy and changelog presence
- release workflow, provenance, and rollback policy presence

The release metadata check is:

```bash
corepack pnpm verify:release
```

It verifies:

- root package stays private
- canonical repository and homepage point to `zaowu-labs/zaowu`
- Node.js and pnpm engine policy stays pinned
- package names, versions, license, ESM exports, files, README files, and
  keywords stay aligned
- workspace package dependencies use `workspace:*`
- only `@zaowu/cli` exposes the `zw` binary
- `docs/RELEASE_POLICY.md` includes the release policy sections
- `docs/RELEASE_POLICY.md` includes provenance and publish-permission sections
- `docs/RELEASE_POLICY.md` includes release workflow requirements and rollback
  rules
- `CHANGELOG.md` includes an `Unreleased` section

The JSON contract check is:

```bash
corepack pnpm verify:json-contracts
```

It verifies built package results and real built CLI output for versioned
machine-readable contracts including init, doctor, config, AI, dev, and
automation commands documented in `docs/JSON_CONTRACTS.md`. It also validates
representative expected-error JSON and checks the error schema code enum
against the core error registry. It also checks repeated command schema
fragments reference the shared command schema definitions.

## Not Yet Ready

Do not publish packages until these are intentionally designed:

- reviewed release workflow with Trusted Publishing or an equivalent provenance
  mechanism
- npm publish permissions and rollback procedure
- public support policy
- backward compatibility policy beyond the current versioned JSON contracts

Versioning, changelog, branch, tag, and local preflight rules are defined in
`docs/RELEASE_POLICY.md`.

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
