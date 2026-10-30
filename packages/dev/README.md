# @zaowu-labs/dev

Developer workflow package for ZaoWu.

This package reads Git state for status, commit-message preview, and local diff
review. It also owns the preview-first `dev sync` operation that fetches origin
and hard-resets the current branch only after explicit confirmation.

Safety:

- Status, commit preview, and review do not modify Git state.
- Sync is destructive, previews by default, and requires explicit confirmation.
- Sync also requires `--discard-local` when tracked changes, commits unique to
  the local branch, or obstructing untracked/ignored paths would be discarded.
  Unrelated untracked files are preserved. Risk is checked against the actual
  origin branch, regardless of upstream configuration, and rechecked after fetch.
- Sync fingerprints bind tracked working-copy and staged content as well as
  the branch, HEAD, cached remote target, and status. Local edits during fetch
  stop the reset and require a fresh preview.
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

## Trustworthy previews

Local review and commit results identify `method: "heuristic"`. Model assistance
uses `method: "ai-assisted"`, and appended model findings identify `origin: "ai"`.
Echo uses `method: "echo"` and retains local results: it is a diagnostic, not a
code reviewer or commit author. Model commit titles must be Conventional Commit
messages of at most 100 characters; malformed suggestions fail visibly.

Git paths use NUL framing for lists/status and decode quoted diff paths, so
Unicode, whitespace, and Unix newline filenames keep their identity. Diff reads
disable external diff drivers, text conversion, and color. Optional Git locks
are disabled; read-only commands leave the index and worktree unchanged.

Cross-package commits use a project scope instead of choosing the first package.
Local rules are risk signals, not a complete review. Untracked files remain
name-only until staged. AI previews disclose included/total diff characters;
only the first 100,000 characters are sent, so stage smaller changes for full
context. Neither local nor AI suggestions commit, stage, or push changes.

AI review locations must agree on file, new-file line, and hunk. Deletion-only
anchors cannot validate new-file lines. Invalid locations are omitted with a
visible explanation; this checks diff coordinates, not the truth of a model claim.
Structured reviews require supported classifications when supplied; invalid JSON
shapes/fences and empty output fail. Omitted classifications keep defaults; plain
prose remains an informational summary and [] is a valid no-findings result.
