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
- Prefer npm Trusted Publishing through GitHub Actions OIDC over long-lived npm
  tokens when the first publish workflow is intentionally enabled.
- Trusted publishing setup must be tied to this repository, the release
  workflow name, and the `@zaowu/*` package scope. Do not reuse credentials or
  trust relationships from a personal fork.

References:

- npm Trusted Publishing:
  <https://docs.npmjs.com/trusted-publishers/>
- GitHub Actions OIDC:
  <https://docs.github.com/en/actions/concepts/security/openid-connect>

## Publish Permissions

- npm publishing credentials must be scoped to the `@zaowu` packages and held by
  the organization, not an individual workstation.
- GitHub release workflow permissions must be least-privilege and limited to the
  publish job that needs them.
- The publish job must not run on pull requests, forks, or unreviewed branches.
- Manual local publish is blocked until the release workflow, permissions, and
  rollback procedure are documented and tested.

## Release Workflow Requirements

Do not add or enable a publishing workflow until all of these are true:

- The workflow is triggered only by reviewed release tags from `main`.
- The workflow checks out the exact tagged commit.
- The workflow uses the pinned Node.js and pnpm policy from `package.json`.
- The workflow runs `corepack pnpm install --frozen-lockfile`.
- The workflow runs `corepack pnpm verify`.
- The workflow performs package dry-run and packed CLI install smoke before any
  publish step.
- The workflow publishes only `@zaowu/*` workspace packages and never publishes
  the private root package.
- The workflow uses Trusted Publishing or another reviewed provenance mechanism
  instead of storing a long-lived npm token in the repository.
- The workflow records package names, versions, tag, commit SHA, and CI run URL
  in release notes.

## Rollback

A rollback plan must exist before first publish:

- Identify the affected package version and the exact release commit.
- Stop any in-progress publish workflow before making changes.
- Prefer a new patch release that reverts the bad change when users may already
  have installed the package.
- Deprecate a broken npm version with a clear replacement version when
  appropriate.
- Document the incident in `CHANGELOG.md` and release notes.
- Re-run the full release gate before publishing a corrective version.

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
