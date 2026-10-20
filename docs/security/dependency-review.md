# Production dependency review

Run `corepack pnpm audit:prod` for the release audit policy. It always requests
the complete production audit, prints every accepted exception, and blocks any
unreviewed finding. Registry errors fail the gate. The underlying
`corepack pnpm audit --prod` remains available and still reports all findings.

## Temporary exception approved on 2026-10-20

The maintainer explicitly approved a 30-day exception for
[GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).
The advisory has no published patched version at the time of review.

The exception matches only:

- package `sprintf-js`, version `1.0.3`, moderate severity;
- path `packages__doc>mammoth>argparse>sprintf-js`;
- pinned Mammoth version `1.12.0`;
- the period ending on 2026-11-19 (UTC).

The checked Mammoth source imports argparse from its standalone `bin/mammoth`.
ZaoWu imports the Mammoth library and does not execute that binary. The audit
gate inspects the loaded library module graph and fails if argparse or
sprintf-js becomes reachable through that entry point. Existing DOCX fixtures
continue to exercise actual conversion and extraction.

This is a reviewed risk acceptance, not a patch to sprintf-js or a claim that
all uses of Mammoth are unaffected. The dependency is still installed and
Mammoth's standalone binary remains outside this exception's usage assumptions.

Any additional path, version, severity, advisory, changed Mammoth version, or
expired review blocks CI and publishing. The policy tests exercise these
rejections. The gate is used by both CI and the release workflow; the general
audit threshold is unchanged.

Remove the exception when upstream publishes a compatible fix, or review the
dependency replacement before 2026-11-20. Do not extend it automatically.
