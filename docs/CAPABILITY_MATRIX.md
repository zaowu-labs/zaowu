# ZaoWu Command Capability Matrix

This matrix keeps runnable commands coordinated across domains. It describes
what each command may read, write, execute, or send before future work expands
the CLI surface.

Legend:

- `none` means the command should not use that capability.
- `preview` means the command reports planned work first and needs confirmation
  before the sensitive action happens.
- `fixed` means only fixed diagnostic or Git commands are executed, never
  arbitrary user-provided shell.

| Command              | File reads             | File writes  | Git state | Shell execution   | Network          | Secrets           | Safety mode                       |
| -------------------- | ---------------------- | ------------ | --------- | ----------------- | ---------------- | ----------------- | --------------------------------- |
| `zw --help`          | none                   | none         | none      | none              | none             | none              | read-only                         |
| `zw help`            | none                   | none         | none      | none              | none             | none              | read-only                         |
| `zw --version`       | none                   | none         | none      | none              | none             | none              | read-only                         |
| `zw version`         | none                   | none         | none      | none              | none             | none              | read-only                         |
| `zw init`            | none                   | `zw.yml`     | none      | none              | none             | none              | preview, `--yes` to write         |
| `zw doctor`          | config path            | none         | none      | fixed diagnostics | none             | env presence only | read-only                         |
| `zw ai ask`          | optional `--file`      | none         | none      | none              | provider gated   | env presence/key  | local by default, network preview |
| `zw ai providers`    | none                   | none         | none      | none              | none             | env presence only | read-only                         |
| `zw auto validate`   | workflow file          | none         | none      | none              | none             | none              | read-only                         |
| `zw auto plan`       | workflow file          | none         | none      | none              | none             | none              | read-only planning                |
| `zw auto run`        | workflow file          | none         | none      | blocked           | blocked          | none              | preview sandbox                   |
| `zw config show`     | config file            | none         | none      | none              | none             | no secret values  | read-only                         |
| `zw config path`     | config path            | none         | none      | none              | none             | none              | read-only                         |
| `zw config validate` | config file            | none         | none      | none              | none             | no secret values  | read-only                         |
| `zw config get`      | config file            | none         | none      | none              | none             | no secret values  | read-only                         |
| `zw config set`      | config file            | config file  | none      | none              | none             | rejects secrets   | preview, `--yes` to write         |
| `zw config migrate`  | config file            | config file  | none      | none              | none             | no secret values  | preview, `--yes` to write         |
| `zw data inspect`    | data file              | none         | none      | none              | none             | none              | read-only                         |
| `zw data analyze`    | data file              | none         | none      | none              | none             | none              | read-only                         |
| `zw data clean`      | data file              | output file  | none      | none              | none             | none              | preview, `--yes` to write         |
| `zw data schema`     | data file              | none         | none      | none              | none             | none              | read-only                         |
| `zw data sample`     | data file              | none         | none      | none              | none             | none              | read-only                         |
| `zw data sheets`     | data file              | none         | none      | none              | none             | none              | read-only                         |
| `zw dev status`      | git status             | none         | read-only | fixed git         | none             | none              | read-only                         |
| `zw dev review`      | git diff               | none         | read-only | fixed git         | none             | none              | read-only                         |
| `zw dev commit`      | staged git diff        | none         | read-only | fixed git         | none             | none              | read-only preview                 |
| `zw dev sync`        | none                   | none         | modifies  | fixed git         | fetch            | none              | preview, `--yes` to sync          |
| `zw doc summary`     | document file          | none         | none      | none              | none             | none              | read-only                         |
| `zw doc extract`     | document file          | none         | none      | none              | none             | none              | read-only                         |
| `zw doc convert`     | document file          | output file  | none      | none              | none             | none              | preview, `--yes` to write         |
| `zw doc outline`     | document file          | none         | none      | none              | none             | none              | read-only                         |
| `zw doc search`      | document file          | none         | none      | none              | none             | none              | read-only                         |
| `zw plugin list`     | plugin directories     | none         | none      | none              | none             | none              | read-only                         |
| `zw plugin install`  | plugin target metadata | plugin files | none      | none              | none             | none              | preview, `--yes` to write later   |
| `zw plugin remove`   | plugin metadata        | plugin files | none      | none              | none             | none              | preview, `--yes` to write later   |
| `zw plugin validate` | plugin manifest        | none         | none      | none              | none             | none              | read-only                         |
| `zw teach plan`      | none                   | none         | none      | none              | none             | none              | read-only                         |
| `zw teach quiz`      | none                   | none         | none      | none              | none             | none              | read-only                         |
| `zw web inspect`     | none by default        | none         | none      | none              | URL with `--yes` | none              | preview, `--yes` for network      |
| `zw web fetch`       | none by default        | none         | none      | none              | URL with `--yes` | none              | preview, `--yes` for network      |

Before adding a runnable command, update this matrix, the command catalog,
schema coverage, and command contract tests together.
