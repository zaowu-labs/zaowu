# Git review evidence integrity — 2026-10-30

Patch 1.2.1 addresses reproduced model-review parsing failures: mismatched line
and hunk locations, deletion-only anchors treated as real new-file lines,
unsupported classifications silently downgraded, and malformed structured output
reported as an informational summary. Ordinary prose, omitted defaults, valid
locations, and empty findings remain supported. Header-only validation failures
also receive an explanation. Prompts request concrete introduced defects and
mark embedded diff instructions as untrusted evidence.

Files: packages/dev/src/ai-assist.ts, focused regressions, real-repository tests,
package README, experience spec, JSON contracts, changelog and version manifests.
No commands, JSON keys/schema version, dependencies, or execution authority change.

Evidence: regression cases failed before the fix; the real temporary Git fixture
uses two staged hunks and proves index bytes are unchanged. Full verification,
production audit, six-platform CI, exact-tag publishing and public install/source
acceptance are required before delivery. See the release for final CI/source links.

Manual checks:

```bash
zw --version
zw dev review --staged --json
zw dev review --staged --ai --provider echo --json
```

These changes verify response structure and diff coordinates, not a model's
semantic correctness. No paid model account is called. Existing heuristic signals
remain risk hints. Truncated AI context and model quality still require smaller,
reviewed changes and independent tests.

Local full verification passed: 632 functional tests in 44 files, 13 policy
tests, schemas/contracts, lint/format, eleven tarballs and packed installation.
Production audit passed with no accepted exceptions.
