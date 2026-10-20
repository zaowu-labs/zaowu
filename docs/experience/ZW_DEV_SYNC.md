# Product Experience Spec: `zw dev sync`

## Summary

`zw dev sync` aligns the current local branch to `origin/<branch>` through an
explicitly previewed fetch and hard reset.

## Safety

- The command previews by default.
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
  - `git fetch origin`
  - `git reset --hard refs/remotes/origin/<branch>`
  - network access to the origin remote
- The operation plan fingerprint must bind the branch, current HEAD, and a
  normalized Git status digest, tracked diff digest, and cached origin target
  so stale confirmations fail if local state changes between preview and
  execution. A second local-state check after fetch stops concurrent edits.
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
