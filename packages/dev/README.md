# @zaowu/dev

Developer workflow package for ZaoWu.

This package reads Git state for status, commit-message preview, and local diff
review. It owns deterministic review signals such as diff hunk summaries,
sensitive-code heuristics, dependency metadata checks, and recommended checks.

Safety:

- Commands in this package do not commit, push, checkout, reset, or stage files.
- Commit preview and review output are read-only and report risks as warnings.
- Commit preview returns both a copyable `message` and a structured `suggestion`
  with inferred type, scope, subject, title, and body lines.
- Commit and review findings include severity, priority, and category so CLI
  users and automation can triage risks consistently.
- Machine-readable commit and review output includes a schema version.
