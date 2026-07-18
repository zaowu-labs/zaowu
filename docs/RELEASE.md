# ZaoWu Release Readiness

ZaoWu publishes public packages under `@zaowu-labs`. This document defines the gates that must pass for every release.

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
- practical candidate, CI, publish, post-publish, and rollback checklist

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
- only `@zaowu-labs/cli` exposes the `zw` binary
- `docs/RELEASE_POLICY.md` includes the release policy sections
- `docs/RELEASE_POLICY.md` includes provenance and publish-permission sections
- `docs/RELEASE_POLICY.md` includes release workflow requirements and rollback
  rules
- `docs/RELEASE_CHECKLIST.md` includes candidate preparation, local preflight,
  CI, tag/publish, post-publish verification, and rollback steps
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

## Trusted publishing setup

The repository includes `.github/workflows/release.yml`. Before using it, configure every npm package to trust:

- repository `zaowu-labs/zaowu`
- workflow filename `release.yml`
- GitHub environment `npm-production`

Protect the environment with required reviewers. The workflow is manual-only, checks out an existing tag, verifies tag/package version alignment, runs the full release gate, and publishes in dependency order with npm provenance.

The workflow uses Node.js 24 so its bundled npm satisfies Trusted Publishing's
Node.js 22.14.0+ and npm 11.5.1+ requirements.

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
