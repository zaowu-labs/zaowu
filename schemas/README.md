# ZaoWu Schemas

This directory contains JSON Schemas for user-authored ZaoWu files. The schemas
document the stable foundation shape for editors, automation, and future
validators.

## Files

- `zaowu.config.schema.json` - `zw.yml`, `zw.yaml`, `zaowu.config.json`, and `.zaowurc`
- `zaowu.workflow.schema.json` - `zw auto validate|plan|run` workflow files,
  including preview-first `permissions`
- `zaowu.plugin.schema.json` - local plugin manifests such as `zaowu.plugin.json`
- `zaowu.command.init.schema.json` - versioned `zw init --json` preview and
  creation result shape
- `zaowu.command.doctor.schema.json` - versioned `zw doctor --json` result
  shape
- `zaowu.command.config-validate.schema.json` - versioned
  `zw config validate --json` result shape
- `zaowu.command.config-set.schema.json` - versioned `zw config set --json`
  preview and write result shape
- `zaowu.command.config-migrate.schema.json` - versioned
  `zw config migrate --json` preview and write result shape
- `zaowu.command.config-path.schema.json` - versioned `zw config path --json`
  result shape
- `zaowu.command.config-show.schema.json` - versioned `zw config show --json`
  result shape
- `zaowu.command.config-get.schema.json` - versioned `zw config get --json`
  result shape
- `zaowu.command.ai-ask.schema.json` - versioned `zw ai ask --json` local,
  preview, and provider-backed result shape
- `zaowu.command.ai-providers.schema.json` - versioned
  `zw ai providers --json` provider inventory and validation result shape
- `zaowu.command.dev-commit.schema.json` - versioned `zw dev commit --json`
  commit-message preview result shape
- `zaowu.command.dev-review.schema.json` - versioned `zw dev review --json`
  result shape
- `zaowu.command.dev-status.schema.json` - versioned `zw dev status --json`
  Git status result shape
- `zaowu.command.auto-validate.schema.json` - versioned
  `zw auto validate --json` result shape
- `zaowu.command.auto-plan.schema.json` - versioned `zw auto plan --json`
  result shape
- `zaowu.command.auto-run.schema.json` - versioned `zw auto run --json`
  result shape
- `zaowu.command.doc-*.schema.json` - versioned document summary, extraction,
  conversion, outline, and search result shapes
- `zaowu.command.data-*.schema.json` - versioned data inspection, analysis,
  cleaning, schema inference, and sampling result shapes
- `zaowu.command.plugin-*.schema.json` - versioned plugin list, install, remove,
  and validation result shapes
- `zaowu.command.teach-*.schema.json` - versioned teaching plan and quiz result
  shapes
- `zaowu.command.web-*.schema.json` - versioned web inspection and fetch preview
  or confirmed result shapes
- `zaowu.command.error.schema.json` - shared expected-error JSON shape and
  registered error-code enum
- `zaowu.command.help.schema.json` - root, domain, and action help JSON
  envelope
- `zaowu.command.version.schema.json` - `zw --version --json` result shape
- `zaowu.command.shared.schema.json` - shared command-output fragments such as
  `operationPlan` with subjects and fingerprint metadata, AI provider/input
  metadata, dev change summaries, automation `policy`, and automation `sandbox`

Runtime validation still lives in the owning packages. Keep schemas, examples,
docs, and package validators aligned whenever command contracts change.

`corepack pnpm verify:schemas` compiles user-authored file schemas with Ajv and
checks both valid and invalid examples against the runtime parsers.

`corepack pnpm verify:json-contracts` validates both built package command
outputs, real built CLI `--json` outputs, and representative CLI error outputs
against command-output schemas. It also checks that command schemas reference
shared command fragments instead of copying them. Every runnable JSON command
except help must register its schema file in
`packages/cli/src/command-contracts.ts`, and the gate fails if that schema is
not loaded and validated.
