# ZaoWu Schemas

This directory contains JSON Schemas for user-authored ZaoWu files. The schemas
document the stable foundation shape for editors, automation, and future
validators.

## Files

- `zaowu.config.schema.json` - `zw.yml`, `zw.yaml`, `zaowu.config.json`, and `.zaowurc`
- `zaowu.workflow.schema.json` - `zw auto validate|plan|run` workflow files
- `zaowu.plugin.schema.json` - local plugin manifests such as `zaowu.plugin.json`

Runtime validation still lives in the owning packages. Keep schemas, examples,
docs, and package validators aligned whenever command contracts change.
