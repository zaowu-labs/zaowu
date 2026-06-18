# @zaowu/dev

Developer workflow package for ZaoWu.

This package reads Git state for status, commit-message preview, and local diff
review. It also owns the preview-first `dev sync` operation that fetches origin
and hard-resets the current branch only after explicit confirmation.

Safety:

- Status, commit preview, and review do not modify Git state.
- Sync is destructive, previews by default, and requires explicit confirmation.
- Sync also requires `--discard-local` when tracked changes or commits ahead of
  the remote branch would be discarded. Untracked files are preserved.
- Sync operation plans disclose `git fetch origin`, the exact hard-reset target,
  and network access to the origin remote.
- Commit preview and review output are read-only and report risks as warnings.
- Commit preview returns both a copyable `message` and a structured `suggestion`
  with inferred type, scope, subject, title, and body lines.
- Commit and review findings include severity, priority, and category so CLI
  users and automation can triage risks consistently.
- Review hunks include new-file line ranges, and line-specific findings expose
  an optional line number.
- Machine-readable commit and review output includes a schema version.
