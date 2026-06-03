# ZaoWu Command Catalog

This catalog describes the first runnable command set. Commands are grouped by
domain so future work stays separated.

## Global Rules

- Default output is human-readable.
- Use `--json` for machine-readable output.
- Sensitive commands preview by default or require `--yes` before writing files
  or sending network requests.
- Unsupported formats should return actionable errors instead of pretending to
  work.

## Root Commands

| Command         | Description                           | Example         |
| --------------- | ------------------------------------- | --------------- |
| `zw init`       | Preview a starter config              | `zw init`       |
| `zw init --yes` | Create `zw.yml`                       | `zw init --yes` |
| `zw doctor`     | Check local environment health        | `zw doctor`     |
| `zw --help`     | Show root help and registered domains | `zw --help`     |

Common failure:

- Existing config: `zw init --yes` refuses to overwrite `zw.yml`.

## `zw config`

| Command          | Description                    | Example                 |
| ---------------- | ------------------------------ | ----------------------- |
| `zw config path` | Print the resolved config path | `zw config path`        |
| `zw config show` | Show validated config          | `zw config show --json` |

Common failures:

- Missing config: run `zw init`, then `zw init --yes`.
- Secret-like config keys: move secrets to environment variables.

## `zw ai`

| Command     | Description                         | Example                     |
| ----------- | ----------------------------------- | --------------------------- |
| `zw ai ask` | Ask through the local echo provider | `zw ai ask "Explain ZaoWu"` |

First-version behavior:

- Uses the local `echo` provider by default.
- Does not call external AI services.
- Unknown providers return an actionable error.

## `zw dev`

| Command         | Description                                      | Example         |
| --------------- | ------------------------------------------------ | --------------- |
| `zw dev commit` | Suggest a commit message from staged changes     | `zw dev commit` |
| `zw dev review` | Review staged changes, then working-tree changes | `zw dev review` |

Safety:

- No Git state is modified.
- `zw dev commit` reads staged changes only.

Common failures:

- No staged changes for commit: run `git add <files>`.
- No changes to review: change files or stage changes first.

## `zw doc`

| Command          | Description                                        | Example                                      |
| ---------------- | -------------------------------------------------- | -------------------------------------------- |
| `zw doc summary` | Summarize text/Markdown                            | `zw doc summary notes.md`                    |
| `zw doc extract` | Extract headings, links, and code block count      | `zw doc extract notes.md`                    |
| `zw doc convert` | Convert text/Markdown with explicit output control | `zw doc convert notes.md --output notes.txt` |

Safety:

- Conversion previews by default when `--output` is used.
- Use `--yes` to write the output file.

Current format support:

- Supported: `.txt`, `.md`, `.markdown`, `.csv`, `.json`, `.yml`, `.yaml`
- Unsupported for now: `.pdf`, `.docx`

## `zw data`

| Command           | Description                | Example                                      |
| ----------------- | -------------------------- | -------------------------------------------- |
| `zw data inspect` | Show CSV/TSV shape         | `zw data inspect sales.csv`                  |
| `zw data analyze` | Analyze numeric columns    | `zw data analyze sales.csv`                  |
| `zw data clean`   | Trim CSV/TSV values safely | `zw data clean sales.csv --output clean.csv` |

Safety:

- Cleaning previews by default when `--output` is used.
- Use `--yes` to write the output file.

Current format support:

- Supported: `.csv`, `.tsv`
- Unsupported for now: `.xlsx`

## `zw auto`

| Command            | Description                        | Example                         |
| ------------------ | ---------------------------------- | ------------------------------- |
| `zw auto validate` | Validate a simple workflow         | `zw auto validate workflow.yml` |
| `zw auto run`      | Dry-run or run safe workflow steps | `zw auto run workflow.yml`      |

Safety:

- `zw auto run` previews by default.
- Use `--yes` to execute supported `message` steps.
- Shell `run` steps are detected but not executed in this first version.

## `zw plugin`

| Command             | Description                               | Example                        |
| ------------------- | ----------------------------------------- | ------------------------------ |
| `zw plugin list`    | List local plugin manifests               | `zw plugin list`               |
| `zw plugin install` | Preview or write a local plugin manifest  | `zw plugin install readme-gen` |
| `zw plugin remove`  | Preview or remove a local plugin manifest | `zw plugin remove readme-gen`  |

Safety:

- Install/remove previews by default.
- Use `--yes` to write or remove files under `.zaowu/plugins`.

## `zw teach`

| Command         | Description                     | Example                             |
| --------------- | ------------------------------- | ----------------------------------- |
| `zw teach plan` | Create a local teaching outline | `zw teach plan "TypeScript basics"` |
| `zw teach quiz` | Create local practice questions | `zw teach quiz notes.md`            |

First-version behavior:

- Uses local deterministic generation.
- Does not call external AI services.

## `zw web`

| Command          | Description                    | Example                                  |
| ---------------- | ------------------------------ | ---------------------------------------- |
| `zw web inspect` | Preview or inspect URL headers | `zw web inspect https://example.com`     |
| `zw web fetch`   | Preview or fetch URL body      | `zw web fetch https://example.com --yes` |

Safety:

- Network requests are not sent by default.
- Use `--yes` to make the request.
