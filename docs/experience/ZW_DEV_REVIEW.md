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
- info/low/summary: Change size - 1 file(s), +3/-1.

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

`diffHunks` reports file path, hunk header, new-file start/end lines, added line
count, and removed line count. It does not include raw diff text by default.
Each finding includes the legacy `severity` plus `priority` and `category`; a
line-specific finding also includes `line` so human output can render
`file:line` and JSON output can locate the addition precisely.

## Safety Rules

- Reads Git status and diff only.
- Does not stage, commit, checkout, reset, push, or write files.
- Sensitive additions are warnings, not automatic blockers.

## Review Heuristics

The first foundation version flags:

- missing tests when source files changed without test files
- package-level source changes without matching package tests
- dependency metadata changes
- package manifest and lockfile consistency risks
- large diff hunks
- newly added shell execution
- newly added file mutation
- newly added network access
- secret-like literals such as provider keys or tokens
- destructive Git commands such as hard reset, clean, checkout overwrite, or
  force push
- focused test markers such as `it.only`

Shell, file mutation, and network scanning applies only to call-like additions
in source, script, workflow, and behavior-bearing configuration files.
Documentation text and schema URLs can describe those risks without producing
false positives.

These heuristics are intentionally local and deterministic. AI review can build
on this later, but should not replace this transparent baseline.

## Acceptance Criteria

- Human output is concise and readable.
- JSON output remains valid and stable.
- No Git state is modified.
- New review signals include tests.
- Command docs and catalog stay aligned.

## Reliability and method disclosure

Local results include `method: "heuristic"`. Confirmed model results use
`method: "ai-assisted"`, with `origin: "ai"` on appended findings. Echo diagnostics
retain local results and use `method: "echo"`. AI plans disclose the exact diff
character count and any truncation at 100,000 characters. Model findings are
suggestions; names of untracked files do not imply their contents were reviewed.
NUL-framed path lists/status preserve special filenames. Diffs disable external
drivers/textconv/color, and optional index locking is disabled. Real repository
fixtures verify unchanged index bytes, HEAD, worktree content, and Git status.

## Review evidence integrity (1.2.1)

Structured model reviews must be arrays with nonempty title/detail and supported
classification values when provided. Omitted classifications retain defaults;
invalid JSON-shaped/fenced output fails rather than masquerading as prose.
Ordinary nonempty prose remains a labeled informational summary, and [] is a
valid no-findings result. A file/line/header location must agree within the same
hunk. Zero-length new-file ranges are deletion anchors, not new-file lines.
Unverifiable locations are omitted with a visible explanation. Prompts request
concrete introduced defects and treat diff content as untrusted evidence.
No guarantee of model review quality or correctness follows from location checks.
