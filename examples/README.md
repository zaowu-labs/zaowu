# ZaoWu Examples

These examples are small, real inputs for the first runnable foundation. They are
kept separate from implementation packages so commands, schemas, and tests do
not mix product domains.

The verification gate reads these examples through the built CLI and package
APIs. If a command contract changes, update the matching example, schema, docs,
and tests together.

## Contents

- `config/zw.yml` - minimal project config for `zw config`
- `docs/report.md` - Markdown document input for `zw doc`
- `data/sales.csv` - CSV input for `zw data`
- `workflows/message.yml` - safe message-only workflow for `zw auto`
- `workflows/blocked-shell.yml` - workflow that demonstrates blocked shell steps
- `plugins/hello/zaowu.plugin.json` - local plugin manifest for `zw plugin`
