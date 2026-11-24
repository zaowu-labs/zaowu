# Product Experience Spec: `zw dev sync`

## Summary

`zw dev sync` aligns the current local branch to `origin/<branch>` through an
explicitly previewed fetch and hard reset.

## Safety

- The command previews by default. Execution validates the supplied fingerprint
  against the snapshot it will use before fetching.
- Fetch the named branch explicitly. If it has been deleted on origin, stop
  before resetting, even when a cached tracking ref still exists. Inspect the
  fetched commit and pass its object ID to the reset.
- Execution requires `--yes`.
- If tracked changes, commits unique to the local branch, or untracked/ignored
  paths obstructing files in `origin/<branch>` are present, execution also
  requires `--discard-local`.
- The commit comparison uses `origin/<branch>` even if the branch has no
  upstream or tracks another remote. Risks are checked again after fetching,
  so a remote history rewrite cannot silently discard local commits.
- Unrelated untracked files remain untouched. Obstructing untracked and ignored
  files can be deleted by hard reset and must be disclosed as discard risks.
- The operation plan must disclose:
  - the current branch and HEAD read
  - current Git status
  - staged and tracked working-copy content
  - origin branch history and untracked/ignored reset collisions
  - `git fetch origin +refs/heads/<branch>:refs/remotes/origin/<branch>`
  - `git reset --hard <verified-origin-commit>`
  - network access to the origin remote
- The operation plan fingerprint binds the full local branch identity, current
  HEAD, worktree and origin, normalized Git status, tracked diff, cached origin
  target, and the contents of obstructing paths. For obstructing directories,
  this includes entries beneath them. For symbolic links, it includes the link
  destination without reading its referent. Unreadable obstructions stop the sync.
  Each inspection reads up to 64 MiB and 4,096 entries across the obstructing
  paths. Move larger obstructions to a backup location before trying again.
  A second local-state check after fetch stops edits outside the reviewed plan.
  A fingerprinted confirmation requires a fresh preview if the fetch exposes
  a new obstructing path or changes the target with local commits to discard.
  Shared directories are inspected for individual obstructing paths.
- Confirmed output must set `operationPlan.confirmationRequired` to `false`.
- `--plan-fingerprint` must reject a changed branch or reset target.
- Expected Git failures use structured ZaoWu errors without raw stack traces.

## Human Output

Preview output explains that tracked working-tree changes and diverged local
commits may be discarded. It shows the previous commit, target branch, exact Git
commands, and operation-plan fingerprint.

Confirmed output reports the previous and current commit after the reset.

## JSON Output

The result follows `schemas/zaowu.command.dev-sync.schema.json` and includes:

- `schemaVersion`
- `status`
- `branch`
- `previousCommit`
- `currentCommit`
- `output`
- `operationPlan`

## Acceptance Criteria

- Preview mode does not fetch or reset.
- Confirmed mode performs the disclosed fetch and reset, with read-only safety
  checks before and after fetching.
- The reset target is `origin/<current-branch>`.
- Tracked changes or commits ahead of the remote require both `--yes` and
  `--discard-local`.
- Obstructing untracked/ignored paths require discard acknowledgement; unrelated
  untracked files do not trigger it and remain untouched.
- Preview and confirmed fingerprints match when the plan is unchanged.
- Tests cover preview, clean confirmation, discard acknowledgement,
  operation-plan contents, and Git failures.
