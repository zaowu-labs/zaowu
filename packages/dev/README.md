# @zaowu/dev

Developer workflow package for ZaoWu.

This package reads Git state for status, commit-message preview, and local diff
review. It owns deterministic review signals such as diff hunk summaries,
sensitive-code heuristics, dependency metadata checks, and recommended checks.

Safety:

- Commands in this package do not commit, push, checkout, reset, or stage files.
- Review output is read-only and reports risks as warnings.
- Review findings include severity, priority, and category so CLI users and
  automation can triage risks consistently.
- Machine-readable review output includes a schema version.
