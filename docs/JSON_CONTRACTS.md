# ZaoWu JSON Contracts

ZaoWu human output can improve freely when it stays readable. JSON output is a
machine-facing contract and should change more carefully.

## Rules

- Public JSON results should include `schemaVersion` when their shape is meant
  to be consumed by automation.
- Additive fields are allowed within the same schema version.
- Removing fields, renaming fields, or changing field meanings requires a new
  schema version and updated docs/tests.
- Expected errors stay stack-free and use the shared error shape:

```json
{
  "error": {
    "code": "TARGET_REQUIRED",
    "message": "Target is required.",
    "why": "`zw auto plan` needs a target argument.",
    "fix": "Run `zw auto plan --help` to see the expected usage.",
    "exitCode": 1
  }
}
```

## Current Versioned Results

### Expected Error JSON

Schema file: `schemas/zaowu.command.error.schema.json`.

Expected command errors use a shared envelope:

```json
{
  "error": {
    "code": "TARGET_REQUIRED",
    "message": "Target is required.",
    "why": "`zw auto plan` needs a target argument.",
    "fix": "Run `zw auto plan --help` to see the expected usage.",
    "exitCode": 1
  }
}
```

The error code enum must stay synchronized with
`packages/core/src/error-codes.ts`. Expected error JSON is written to stderr and
must not include stack traces or extra fields.

### `zw doctor --json`

Current result schema: `schemaVersion: 1`.

Schema file: `schemas/zaowu.command.doctor.schema.json`.

Stable fields:

- `status`
- `checks`
- `nextSteps`
- `operationPlan`

`checks` reports fixed setup diagnostics for Node.js, Git, pnpm, and config
discovery. The pnpm check may be satisfied by either `pnpm --version` or
`corepack pnpm --version`; the command-level `operationPlan` discloses both
diagnostic commands because `doctor` is read-only but still runs shell checks.

### `zw dev review --json`

Current result schema: `schemaVersion: 1`.

Schema file: `schemas/zaowu.command.dev-review.schema.json`.

Stable fields:

- `status`
- `source`
- `summary`
- `diffHunks`
- `findings`
- `recommendedChecks`
- `operationPlan` when routed through the CLI

`diffHunks` intentionally reports only file path, hunk header, and line counts.
It does not expose raw diff text by default.

### `zw auto validate --json`

Current result schema: `schemaVersion: 1`.

Schema file: `schemas/zaowu.command.auto-validate.schema.json`.

Stable fields:

- `status`
- `filePath`
- `workflow`
- `policy`
- `sandbox`
- `warnings`

`workflow.permissions` reflects the user-authored workflow policy after parsing.
`policy` is the runtime policy output and includes its own `schemaVersion`.
`sandbox` is the execution boundary for the foundation version. It reports
`root: "workflow-directory"` and a resolved `workflowDirectory` path so users can
audit the directory future execution would be confined to.

### `zw auto plan --json`

Current result schema: `schemaVersion: 1`.

Schema file: `schemas/zaowu.command.auto-plan.schema.json`.

Stable fields:

- `status`
- `filePath`
- `workflow`
- `policy`
- `sandbox`
- `steps`
- `warnings`

Each step includes `policyDecision` so automation can distinguish ready,
blocked, and unsupported actions without parsing text. Each step also includes a
schema-versioned `operationPlan` so callers can inspect per-step risk,
confirmation requirements, and planned execution without parsing human output.

### `zw auto run --json`

Current result schema: `schemaVersion: 1`.

Schema file: `schemas/zaowu.command.auto-run.schema.json`.

Stable fields:

- `status`
- `filePath`
- `workflow`
- `policy`
- `sandbox`
- `executed`
- `skipped`
- `operationPlan` when routed through the CLI

In the foundation version, `message` steps can execute after confirmation.
Shell steps remain blocked even when workflow permissions request `prompt`.

## Verification

The full gate runs:

```bash
corepack pnpm verify:json-contracts
```

This imports the built package outputs and executes the real built CLI for the
versioned `doctor`, `dev review`, `auto validate`, `auto plan`, and `auto run`
contracts. Both layers must validate against the same schemas. The same gate
also validates representative real CLI expected-error JSON against the shared
error schema. Shared command schema fragments such as `operationPlan`,
automation `policy`, and automation `sandbox` live in
`schemas/zaowu.command.shared.schema.json`; the same gate checks that command
schemas reference those definitions instead of copying them.
