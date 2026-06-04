# ZaoWu Command Catalog

This catalog describes the current runnable command set. Commands stay grouped
by domain so future work does not mix unrelated tools.

## Global Rules

- Default output is human-readable.
- Use `--json` for machine-readable output.
- Use `--help` on root, domains, and actions.
- Sensitive commands preview by default or require `--yes` before writing files,
  removing files, or sending network requests.
- Sensitive JSON output includes `operationPlan` with `schemaVersion`, reads,
  writes, deletes, execution, network, secrets, risk, and confirmation
  requirements.
- `--dry-run` forces preview mode when it is used with `--yes`.
- Unsupported formats return actionable errors instead of pretending to work.

## Root Commands

| Command         | Description                           | Example         |
| --------------- | ------------------------------------- | --------------- |
| `zw init`       | Preview a starter config              | `zw init`       |
| `zw init --yes` | Create `zw.yml`                       | `zw init --yes` |
| `zw doctor`     | Check local environment health        | `zw doctor`     |
| `zw --help`     | Show root help and registered domains | `zw --help`     |
| `zw --version`  | Show CLI version                      | `zw --version`  |

Common failure:

- Existing config: `zw init --yes` refuses to overwrite `zw.yml`.

## `zw config`

| Command              | Description                          | Example                                 |
| -------------------- | ------------------------------------ | --------------------------------------- |
| `zw config path`     | Print the resolved config path       | `zw config path`                        |
| `zw config show`     | Show resolved config                 | `zw config show --json`                 |
| `zw config validate` | Validate config and warnings         | `zw config validate`                    |
| `zw config get`      | Read one supported key               | `zw config get project.name`            |
| `zw config set`      | Preview or write one supported key   | `zw config set project.name demo --yes` |
| `zw config migrate`  | Preview or write canonical config v1 | `zw config migrate --yes`               |

Supported keys:

- `version`
- `project.name`
- `ai.provider`
- `defaults.output`
- `paths.workspace`
- `paths.cache`

Common failures:

- Missing config: run `zw init`, then `zw init --yes`.
- Secret-like config keys: move secrets to environment variables.
- Unsupported keys: extend `packages/config` before adding new keys.

## `zw ai`

| Command           | Description                        | Example                             |
| ----------------- | ---------------------------------- | ----------------------------------- |
| `zw ai ask`       | Ask through a registered provider  | `zw ai ask "Explain ZaoWu"`         |
| `zw ai providers` | List provider configuration status | `zw ai providers --provider openai` |

First-version behavior:

- Uses the local `echo` provider by default.
- `zw ai ask --file README.md` includes a readable file as explicit input.
- The OpenAI provider uses the Responses API when `OPENAI_API_KEY` is set.
- `OPENAI_MODEL` or `--model` can override the default model.
- API keys must come from environment variables, not from `zw.yml`.
- Network providers preview by default; use `--yes` to send the request.
- Network providers require explicit confirmation in the AI package API, not only
  in the CLI layer.
- Provider requests have a timeout and a bounded combined prompt/file-input
  length.
- Preview mode reads any `--file` input and reports prompt, file, combined, and
  maximum input character counts without sending a network request.

Common failures:

- Missing prompt and file input: pass a prompt or `--file`.
- Unknown provider: run `zw ai providers`.
- Missing OpenAI key: set `OPENAI_API_KEY` in the shell environment.

## `zw dev`

| Command         | Description                                  | Example                  |
| --------------- | -------------------------------------------- | ------------------------ |
| `zw dev status` | Show branch, staged, unstaged, and untracked | `zw dev status`          |
| `zw dev review` | Review staged or working-tree changes        | `zw dev review --staged` |
| `zw dev commit` | Suggest a commit message from staged changes | `zw dev commit`          |

Safety:

- No Git state is modified.
- `zw dev commit` reads staged changes only.
- `zw dev review --staged` and `zw dev review --worktree` keep sources explicit.
- Review and commit previews include change categories and recommended checks so
  users know whether build, test, lint, format, or frozen install is relevant.
- Worktree review lists untracked files by name; stage them when full Git diff
  context is required.

Common failures:

- No staged changes for commit: run `git add <files>`.
- No changes to review: change files or stage changes first.

## `zw doc`

| Command          | Description                                       | Example                                      |
| ---------------- | ------------------------------------------------- | -------------------------------------------- |
| `zw doc summary` | Summarize supported documents                     | `zw doc summary notes.md`                    |
| `zw doc extract` | Extract headings, links, code blocks, frontmatter | `zw doc extract notes.md`                    |
| `zw doc convert` | Convert with explicit output control              | `zw doc convert notes.md --output notes.txt` |
| `zw doc outline` | Create a heading outline                          | `zw doc outline notes.md`                    |
| `zw doc search`  | Search by keyword                                 | `zw doc search notes.md install`             |

Safety:

- Conversion previews by default when `--output` is used.
- Use `--yes` to write the output file.
- Confirmed conversion refuses to overwrite the input file or an existing output
  file.

Current format support:

- Supported: `.txt`, `.md`, `.markdown`, `.csv`, `.json`, `.yml`, `.yaml`,
  `.pdf`, `.docx`
- PDF and DOCX are extracted as text. Rich layout, comments, tracked changes,
  and embedded media are not preserved in this foundation version.

## `zw data`

| Command           | Description                         | Example                                      |
| ----------------- | ----------------------------------- | -------------------------------------------- |
| `zw data inspect` | Show table shape and missing values | `zw data inspect sales.xlsx --sheet Q1`      |
| `zw data analyze` | Analyze numeric columns             | `zw data analyze sales.csv`                  |
| `zw data clean`   | Trim values and remove empty lines  | `zw data clean sales.csv --output clean.csv` |
| `zw data schema`  | Infer lightweight column schema     | `zw data schema sales.xlsx --sheet Q1`       |
| `zw data sample`  | Show sample rows                    | `zw data sample sales.csv --rows 3`          |

Safety:

- Cleaning previews by default when `--output` is used.
- Use `--yes` to write the output file.
- Confirmed cleaning refuses to overwrite the input file or an existing output
  file.

Current format support:

- Supported: `.csv`, `.tsv`, `.xlsx`
- XLSX support reads the first worksheet by default. Use `--sheet <name>` on
  inspect, analyze, clean, schema, or sample to select a worksheet by name.
- XLSX values are normalized to strings for this foundation version.
- Blank headers become `column_<index>`, and duplicate headers gain numeric
  suffixes before JSON sample or schema output is generated.

## `zw auto`

| Command            | Description                             | Example                         |
| ------------------ | --------------------------------------- | ------------------------------- |
| `zw auto validate` | Validate a simple workflow              | `zw auto validate workflow.yml` |
| `zw auto plan`     | Show variable substitution and blockers | `zw auto plan workflow.yml`     |
| `zw auto run`      | Dry-run or run supported message steps  | `zw auto run workflow.yml`      |

Workflow support:

- JSON or simple YAML files ending in `.json`, `.yml`, or `.yaml`.
- Workflows default to `version: 1`; unsupported explicit versions are reported
  as warnings.
- `vars` can be referenced as `{{name}}`.
- `message` steps can run when confirmed.
- `run` shell steps are detected, planned, and blocked.

Safety:

- `zw auto run` previews by default.
- Use `--yes` to execute supported `message` steps.
- Shell execution is not enabled in this foundation version.
- Shell-like steps remain visible in plans so users can see exactly what is
  blocked.

## `zw plugin`

| Command              | Description                               | Example                                   |
| -------------------- | ----------------------------------------- | ----------------------------------------- |
| `zw plugin list`     | List local plugin manifests               | `zw plugin list`                          |
| `zw plugin install`  | Preview or write a local plugin manifest  | `zw plugin install readme-gen`            |
| `zw plugin remove`   | Preview or remove a local plugin manifest | `zw plugin remove readme-gen`             |
| `zw plugin validate` | Validate a plugin id or local manifest    | `zw plugin validate ./plugins/readme-gen` |

Manifest support:

- Local source directories can contain `zaowu.plugin.json` or `plugin.json`.
- Local manifests may declare `schemaVersion: 1`.
- Duplicate command names, unsupported schema versions, non-string manifest
  names, and non-string command summaries are validation errors.
- Install/remove writes only under `.zaowu/plugins`.
- There is no public marketplace in this foundation version.

Safety:

- Install/remove previews by default.
- Use `--yes` to write or remove files.
- Confirmed install refuses to overwrite an existing plugin manifest.
- Confirmed remove refuses missing plugin manifests instead of pretending a file
  was removed.

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

## Contract Guards

The CLI keeps a command contract registry in `packages/cli/src/command-contracts.ts`.
Every registered command must keep action help available in both human and JSON
forms.

The `corepack pnpm verify` script runs build, CLI smoke, tests, lint, format
check, and package dry-run. The smoke check in `scripts/verify-cli-smoke.mjs`
exercises the built CLI across init, doctor, AI preview, data, document,
automation, plugin, and web preview paths. `scripts/verify-local.ps1` and
`scripts/verify-local.sh` add frozen install and `git diff --check` before
pushing.

Domain packages also declare capability ledgers. The boundary guard test checks
source imports and package manifests so feature packages do not import each other
directly, shared packages do not depend on feature packages, and no package
depends on the CLI.
