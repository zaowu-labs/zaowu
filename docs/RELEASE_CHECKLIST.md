# ZaoWu Release Checklist

Use this checklist only after the release workflow and organization publishing
permissions described in `docs/RELEASE_POLICY.md` are intentionally enabled.
Until then, public npm publishing remains blocked.

## Candidate Preparation

- Confirm the release starts from `main` with a clean working tree.
- Confirm `origin` is `https://github.com/zaowu-labs/zaowu.git`.
- Choose the version according to the release policy.
- Update every workspace package to the same version.
- Move relevant `CHANGELOG.md` entries out of `Unreleased`.
- Review command, JSON contract, safety, and package metadata changes.

## Local Preflight

Run:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm verify
git diff --check
```

Inspect package contents and the temporary packed CLI result produced by the
full gate. Do not continue if any check fails.

## Pull Request And CI

- Open a release pull request against `main`.
- Require review of version, changelog, package contents, and safety changes.
- Confirm all supported Node.js and operating-system CI jobs pass.
- Merge without bypassing required checks.
- Record the exact merge commit SHA.

## Tag And Publish

- Confirm the merge commit is on `main` and CI is green.
- Create the annotated `v<version>` tag from that exact commit.
- Push the tag to the canonical repository.
- Confirm the reviewed release workflow checks out the tagged commit.
- Confirm the publish job uses npm Trusted Publishing or the approved
  provenance mechanism.
- Confirm only `@zaowu-labs/*` workspace packages are selected; the private root
  package must never publish.
- Verify package name, version, tag, commit SHA, provenance, and workflow URL
  before approving any protected publish environment.

## Post-Publish Verification

- Verify each expected package and version on npm.
- Inspect npm provenance for every published package.
- Install the released CLI in a clean temporary directory.
- Run `zw --version`, `zw --help`, `zw doctor --json`, and representative
  preview-first commands.
- Create GitHub release notes containing package names, version, tag, commit
  SHA, CI run URL, user-visible changes, and known limitations.
- Confirm documentation examples reference the released version and current
  command behavior.

## Rollback

- Stop any still-running release job before remediation.
- Identify the affected package, version, tag, and exact release commit.
- Prefer a corrective patch release over deleting an already consumed version.
- Deprecate a broken npm version with a clear replacement when appropriate.
- Document the incident in `CHANGELOG.md` and the corrective release notes.
- Re-run `corepack pnpm verify` before publishing the corrective version.

Never reuse a failed version number, move an existing release tag, publish from
a personal fork, or repair a release with an unreviewed local publish.
