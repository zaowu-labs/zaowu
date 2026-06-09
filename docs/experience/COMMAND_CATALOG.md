# ZaoWu Command Catalog

This catalog describes the current runnable command set. Commands stay grouped
by domain so future work does not mix unrelated tools.

## Global Rules

- Default output is human-readable.
- Use `--json` for machine-readable output.
- Use `--help` on root, domains, and actions.
- Sensitive commands preview by default or require `--yes` before writing files,
  removing files, or sending network requests.
- Sensitive JSON output includes `operationPlan` with `schemaVersion`, subjects,
  reads, writes, deletes, execution, network, secrets, risk, confirmation
  requirements, and a `sha256-v1` fingerprint.
- `--plan-fingerprint <hash>` can be used with `--yes` to reject a confirmed
  sensitive action when the current operation plan no longer matches the
  previewed plan.
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

The public config shape is documented in `schemas/zaowu.config.schema.json`.

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
- Provider HTTP errors are classified so authentication, rate-limit,
  bad-request, and provider-side failures get clearer fixes.
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
| `zw dev commit` | Suggest a structured commit preview          | `zw dev commit`          |

Safety:

- No Git state is modified.
- `zw dev commit` reads staged changes only.
- `zw dev review --staged` and `zw dev review --worktree` keep sources explicit.
- Commit previews include a structured Conventional Commit suggestion, suggested
  body lines, staged risk findings, change categories, and recommended checks so
  users know what to review before copying the message.
- Review output includes diff hunk summaries and deterministic risk signals for
  large hunks, shell execution, file mutation, network access, secret-like
  literals, destructive Git commands, and focused tests.
- Review and commit findings keep `severity`, `priority`, and `category` for
  automation-friendly grouping.
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

| Command            | Description                             | Example                                           |
| ------------------ | --------------------------------------- | ------------------------------------------------- |
| `zw auto validate` | Validate a simple workflow              | `zw auto validate examples/workflows/message.yml` |
| `zw auto plan`     | Show variable substitution and blockers | `zw auto plan examples/workflows/message.yml`     |
| `zw auto run`      | Dry-run or run supported message steps  | `zw auto run examples/workflows/message.yml`      |

Workflow support:

- JSON or simple YAML files ending in `.json`, `.yml`, or `.yaml`.
- Workflows default to `version: 1`; unsupported explicit versions are reported
  as warnings.
- `vars` can be referenced as `{{name}}`.
- `permissions` can declare `shell`, `fileWrites`, and `network` as `blocked` or
  `prompt`; this is a planning policy, not execution permission in this phase.
- JSON output separates the parsed workflow permissions from the runtime
  `policy` and blocked execution `sandbox`.
- The `sandbox` reports the resolved workflow directory so users can audit the
  path boundary before any future execution support exists.
- Plan steps include per-step `operationPlan` entries for risk, confirmation,
  and planned execution.
- `message` steps can run when confirmed.
- `run` shell steps are detected, planned, and blocked.
- The public workflow shape is documented in `schemas/zaowu.workflow.schema.json`.
- Shell execution must not be enabled until
  `docs/experience/ZW_AUTO_EXECUTION.md` acceptance criteria are met.

Safety:

- `zw auto run` previews by default.
- Use `--yes` to execute supported `message` steps.
- Shell execution is not enabled in this foundation version.
- Shell-like steps remain visible in plans so users can see exactly what is
  blocked.
- Shell steps stay blocked even when `permissions.shell: prompt` is declared.
- The execution sandbox reports the workflow directory plus shell commands, file
  writes, and network access as blocked.

## `zw plugin`

| Command              | Description                               | Example                                     |
| -------------------- | ----------------------------------------- | ------------------------------------------- |
| `zw plugin list`     | List local plugin manifests               | `zw plugin list`                            |
| `zw plugin install`  | Preview or write a local plugin manifest  | `zw plugin install readme-gen`              |
| `zw plugin remove`   | Preview or remove a local plugin manifest | `zw plugin remove readme-gen`               |
| `zw plugin validate` | Validate a plugin id or local manifest    | `zw plugin validate examples/plugins/hello` |

Manifest support:

- Local source directories can contain `zaowu.plugin.json` or `plugin.json`.
- Local manifests may declare `schemaVersion: 1`.
- Duplicate command names, unsupported schema versions, non-string manifest
  names, and non-string command summaries are validation errors.
- The public manifest shape is documented in `schemas/zaowu.plugin.schema.json`.
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
forms. Every runnable JSON command except help must also register a versioned
result schema, and the JSON contract gate validates both package and real CLI
output against it.

The `corepack pnpm verify` script runs build, JSON contract checks, CLI smoke,
tests, lint, format check, release readiness, and package dry-run. The smoke
check in `scripts/verify-cli-smoke.mjs`
exercises the built CLI across init, doctor, config, AI provider preview, dev
Git previews, data, document, automation, plugin, and web preview paths.
`scripts/verify-local.ps1` and `scripts/verify-local.sh` add frozen install and
`git diff --check` before pushing.

Domain packages also declare capability ledgers. The boundary guard test checks
source imports and package manifests so feature packages do not import each other
directly, shared packages do not depend on feature packages, and no package
depends on the CLI.
