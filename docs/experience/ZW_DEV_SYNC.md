# Product Experience Spec: `zw dev sync`

## Summary

`zw dev sync` aligns the current local branch to `origin/<branch>` through an
explicitly previewed fetch and hard reset.

## Safety

- The command previews by default.
- Execution requires `--yes`.
- If tracked changes or local commits ahead of `origin/<branch>` are present,
  execution also requires `--discard-local`.
- Untracked files are disclosed but are not treated as discarded by
  `git reset --hard`.
- The operation plan must disclose:
  - the current branch and HEAD read
  - current Git status
  - `git fetch origin`
  - `git reset --hard origin/<branch>`
  - network access to the origin remote
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
- Confirmed mode runs only the two disclosed Git commands.
- The reset target is `origin/<current-branch>`.
- Tracked changes or commits ahead of the remote require both `--yes` and
  `--discard-local`.
- Untracked files do not trigger discard acknowledgement and remain untouched.
- Preview and confirmed fingerprints match when the plan is unchanged.
- Tests cover preview, clean confirmation, discard acknowledgement,
  operation-plan contents, and Git failures.
