# Product Experience Spec: `zw dev review`

## Summary

`zw dev review` reviews staged or working-tree Git changes without modifying Git
state.

## Target User

Developers and technical creators who want a fast local sanity check before
running the full validation suite or opening a pull request.

## Core Job

Turn a Git diff into a concise review preview with change size, changed domains,
diff hunks, risk signals, and recommended checks.

## Golden Path

```bash
zw dev review --staged
```

Expected output:

```text
ZaoWu Dev Review

Source: staged
Files: 1
Changes: +3/-1

Findings:
- info: Change size - 1 file(s), +3/-1.

Diff hunks:
- packages/dev/src/index.ts @@ -10,0 +11 @@: +1/-0
```

## Command Design

```bash
zw dev review [--staged|--worktree] [options]
```

Options:

| Option       | Meaning                              |
| ------------ | ------------------------------------ |
| `--staged`   | Review only staged changes           |
| `--worktree` | Review only unstaged working changes |
| `--json`     | Output machine-readable JSON         |

## Input Rules

- Default mode first reads staged changes.
- If no staged changes exist, default mode falls back to working-tree changes.
- `--staged` disables fallback.
- `--worktree` reads unstaged working-tree diff and untracked file names.
- Untracked files are listed by name only until staged.

## Output Rules

JSON output includes stable top-level keys:

```json
{
  "schemaVersion": 1,
  "status": "ok",
  "source": "staged",
  "summary": {},
  "diffHunks": [],
  "findings": [],
  "recommendedChecks": []
}
```

`diffHunks` reports file path, hunk header, added line count, and removed line
count. It does not include raw diff text by default.

## Safety Rules

- Reads Git status and diff only.
- Does not stage, commit, checkout, reset, push, or write files.
- Sensitive additions are warnings, not automatic blockers.

## Review Heuristics

The first foundation version flags:

- missing tests when source files changed without test files
- dependency metadata changes
- package manifest and lockfile consistency risks
- large diff hunks
- newly added shell execution
- newly added file mutation
- newly added network access
- focused test markers such as `it.only`

These heuristics are intentionally local and deterministic. AI review can build
on this later, but should not replace this transparent baseline.

## Acceptance Criteria

- Human output is concise and readable.
- JSON output remains valid and stable.
- No Git state is modified.
- New review signals include tests.
- Command docs and catalog stay aligned.
