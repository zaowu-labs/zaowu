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
`sandbox` is the execution boundary for the foundation version.

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
blocked, and unsupported actions without parsing text.

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

This imports the built package outputs and validates the versioned `dev review`,
`auto validate`, `auto plan`, and `auto run` contracts against their schemas.
