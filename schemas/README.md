# ZaoWu Schemas

This directory contains JSON Schemas for user-authored ZaoWu files. The schemas
document the stable foundation shape for editors, automation, and future
validators.

## Files

- `zaowu.config.schema.json` - `zw.yml`, `zw.yaml`, `zaowu.config.json`, and `.zaowurc`
- `zaowu.workflow.schema.json` - `zw auto validate|plan|run` workflow files,
  including preview-first `permissions`
- `zaowu.plugin.schema.json` - local plugin manifests such as `zaowu.plugin.json`
- `zaowu.command.doctor.schema.json` - versioned `zw doctor --json` result
  shape
- `zaowu.command.dev-review.schema.json` - versioned `zw dev review --json`
  result shape
- `zaowu.command.auto-validate.schema.json` - versioned
  `zw auto validate --json` result shape
- `zaowu.command.auto-plan.schema.json` - versioned `zw auto plan --json`
  result shape
- `zaowu.command.auto-run.schema.json` - versioned `zw auto run --json`
  result shape
- `zaowu.command.error.schema.json` - shared expected-error JSON shape and
  registered error-code enum
- `zaowu.command.shared.schema.json` - shared command-output fragments such as
  `operationPlan`, automation `policy`, and automation `sandbox`

Runtime validation still lives in the owning packages. Keep schemas, examples,
docs, and package validators aligned whenever command contracts change.

`corepack pnpm verify:schemas` compiles user-authored file schemas with Ajv and
checks both valid and invalid examples against the runtime parsers.

`corepack pnpm verify:json-contracts` validates both built package command
outputs, real built CLI `--json` outputs, and representative CLI error outputs
against command-output schemas. It also checks that command schemas reference
shared command fragments instead of copying them.
