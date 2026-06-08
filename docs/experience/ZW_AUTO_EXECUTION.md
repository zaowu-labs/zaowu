# Product Experience Spec: `zw auto` Execution Foundation

## Summary

`zw auto` can validate, plan, and preview workflows. Shell execution remains
blocked until the execution model below is implemented and verified.

## Current State

- `message` steps can run only after confirmation.
- `run` shell steps are parsed, planned, and blocked.
- Workflow `permissions` describe requested policy.
- Runtime `policy` describes what ZaoWu will allow in this version.
- Runtime `sandbox` reports the resolved workflow directory plus shell commands,
  file writes, and network access as blocked.
- Runtime plan steps include per-step `operationPlan` entries before any
  execution support is expanded.

## Execution Principles

1. Plans before actions: every sensitive step must appear in `zw auto plan`.
2. No hidden authority: workflow permissions do not grant execution by
   themselves.
3. Stable working root: future execution should default to the resolved
   workflow directory and reject path escapes.
4. Explicit writes: future file writes need planned paths and overwrite rules.
5. Explicit network: future network steps need planned targets and confirmation.
6. Secret boundaries: workflows must reference secrets by name, not store secret
   values in files.
7. Recoverable failure: failed steps should report what ran, what did not run,
   and what can be retried.
8. Bounded output: executed steps must capture output with explicit byte and
   line limits so logs cannot flood the terminal or JSON output.

## Required Before Shell Execution

Do not enable shell commands until all of these exist:

- command spec update for shell execution
- workflow schema update for shell step policy
- execution sandbox implementation with path containment
- tests proving resolved working directories and declared write paths cannot
  escape the workflow directory unless a future explicit policy allows it
- per-step operation plan entries
- dry-run output that includes resolved commands without executing them
- confirmation behavior for shell steps
- tests for blocked, prompted, confirmed, failed, and unsupported shell steps
- Windows and Unix command invocation tests
- output capture limits for stdout and stderr
- docs and command catalog updates
- CI coverage for the execution path

## First Acceptable Shell Scope

The first shell execution version, if implemented later, should be narrow:

- command string only, no implicit shell interpolation helpers
- working directory fixed to the workflow directory
- inherited environment minimized and documented
- no file writes unless the plan declares them
- no network unless the plan declares targets
- timeout required
- output captured and bounded
- structured result for each executed step with status, started/skipped reason,
  exit code when applicable, bounded stdout, bounded stderr, and retry guidance

## Acceptance Criteria

- Default behavior remains preview-first.
- `zw auto plan --json` remains schema-versioned.
- `zw auto plan --json` includes per-step operation plans.
- `zw auto run` never executes a step that was absent from the plan.
- Confirmed `zw auto run --yes` may execute message steps, but shell steps stay
  blocked until every requirement above is met.
- Human output explains blocked, ready, executed, and skipped steps.
- Expected failures use structured ZaoWu errors and no raw stack traces.
