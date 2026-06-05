# ZaoWu Release Policy

ZaoWu is not ready for public npm publishing yet. This policy defines the rules
that must be true before the first publish and every publish after that.

## Versioning

- The root package and every `@zaowu/*` workspace package use the same version.
- Before `1.0.0`, breaking command or JSON contract changes must be called out
  in the changelog even when semver still permits `0.x` movement.
- Patch releases are for bug fixes, docs corrections, and validation hardening.
- Minor releases are for new commands, new supported file formats, or additive
  JSON contract fields.

## Changelog

- `CHANGELOG.md` must have an `Unreleased` section before a release starts.
- Release notes must describe user-visible command changes, JSON contract
  changes, safety behavior changes, and package metadata changes.
- Validation-only changes should be listed when they change what CI blocks.

## Branches And Tags

- Releases come from `main` only.
- The local remote must point to `https://github.com/zaowu-labs/zaowu.git`.
- Release tags use `v<version>`, for example `v0.1.0`.
- A release tag is created only after the release commit is on `main` and CI is
  green.

## npm Publish Rules

- Do not publish from a personal fork.
- Do not publish from an uncommitted working tree.
- Run `corepack pnpm verify` before any publish attempt.
- Run package dry-run and packed CLI install smoke before publish.
- Public npm publishing must use provenance from the release workflow once the
  workflow is intentionally designed.
- API keys and npm tokens must stay out of repository files and memory.

## Provenance

- The first public npm publish must happen from a reviewed GitHub Actions
  release workflow, not from an ad hoc local shell.
- npm provenance must be enabled for public packages once publishing is turned
  on.
- Release artifacts must be built from the exact commit tagged for the release.
- The workflow must run the same release gates documented in this repository
  before publishing.

## Publish Permissions

- npm publishing credentials must be scoped to the `@zaowu` packages and held by
  the organization, not an individual workstation.
- GitHub release workflow permissions must be least-privilege and limited to the
  publish job that needs them.
- Manual local publish is blocked until the release workflow, permissions, and
  rollback procedure are documented and tested.

## Preflight

Before any publish attempt:

```bash
git remote -v
corepack pnpm install --frozen-lockfile
corepack pnpm verify
git diff --check
```

The release is blocked if any command fails, if CI is not green on `main`, or if
package contents do not include expected `dist`, `package.json`, and `README.md`
files.
