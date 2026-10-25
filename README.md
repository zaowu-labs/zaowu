<div align="center">

# 🛠️ ZaoWu / 造物

**面向开发者和技术创作者的本地优先 AI 工作工具箱。**

One CLI for development, documents, data, teaching, and controlled automation.

[![Version](https://img.shields.io/badge/version-1.1.1-blue.svg)](package.json)
[![CI](https://github.com/zaowu-labs/zaowu/actions/workflows/ci.yml/badge.svg)](https://github.com/zaowu-labs/zaowu/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.19%2B-orange.svg)](package.json)

</div>

ZaoWu brings repeated technical work under one entry point: `zw`. Review Git
changes, extract document content, inspect tables, draft teaching material, and
preview automation with consistent commands, configuration, errors, and JSON
output. Choose a model provider when a task needs AI.

Sensitive operations preview by default or require explicit confirmation. The
operation plan shows the files, network targets, and actions involved before you
confirm. Local document and data commands work without a model account.

## Quick Start

Requires **Node.js 20.19+**. Git is needed for developer commands. pnpm is only
needed for repository development.

```bash
npm install -g @zaowu-labs/cli@1.1.1
zw --version
zw --help
```

**npm 12:** XLSX support uses the pinned official
[SheetJS 0.20.3 tarball](https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz).
If npm reports `EALLOWREMOTE`, allow URL dependencies for this installation:

```bash
npm install -g --allow-remote=all @zaowu-labs/cli@1.1.1
```

The flag applies to that command only. See the
[installation guide](docs/GETTING_STARTED.md#install) for details.

To try help without a global install:

```bash
npx --package @zaowu-labs/cli@1.1.1 zw --help
# With npm 12:
npx --allow-remote=all --package @zaowu-labs/cli@1.1.1 zw --help
```

### Set up a project

Run these from your project directory:

```bash
zw init
zw init --yes
zw doctor
```

`zw init` previews the file. `--yes` creates it. An existing `zw.yml`, `zw.yaml`,
`zaowu.config.json`, or `.zaowurc` is preserved. `doctor` reports setup issues
and recovery steps; an absent pnpm installation is optional for CLI users.

### Get a useful local result

In an empty demo directory, create two small inputs. Existing files with these
names are preserved by exclusive creation:

```bash
node -e "require('node:fs').writeFileSync('zaowu-demo.md', '# Project notes\n\n## Tasks\nReview the release.\n', {flag:'wx'})"
node -e "require('node:fs').writeFileSync('zaowu-demo.csv', 'name,amount\nalpha,12\nbeta,18\n', {flag:'wx'})"
zw doc outline zaowu-demo.md
zw data schema zaowu-demo.csv
zw data sample zaowu-demo.csv --rows 1 --json
```

The document command lists headings. The schema identifies `name` as text and
`amount` as numeric. The sample returns one row as structured JSON. These
commands read the inputs without changing them or calling a model.

Inside a Git repository:

```bash
zw dev status
zw dev review
zw dev commit
```

Review summarizes available changes; commit suggests a message from staged
changes. If there are no changes, the error explains what to prepare. These
three commands keep Git state unchanged. `zw dev sync` is a separate sensitive
operation: read its preview and [sync behavior](docs/experience/ZW_DEV_SYNC.md)
before confirming a reset.

### Choose AI explicitly

```bash
zw ai providers
zw ai ask "Explain this project" --provider echo
zw ai ask "Review these notes" --file zaowu-demo.md --provider openai
```

Echo demonstrates the supplied input locally. OpenAI, Anthropic, and Ollama are
real model providers. The OpenAI example previews the request; sending it needs
the provider environment setup and explicit confirmation. Copy the confirmation
command from the preview to bind it to the exact input and plan.

You can save a project preference after initialization:

```bash
zw config set ai.provider ollama
```

This also previews first and prints the exact command to apply the change.
Provider precedence is explicit `--provider`, project preferences, global
preferences, then Echo. Invalid configuration produces a recovery error.
Human model answers stream; Ctrl+C cancels. `--json` stays one complete result.
See [provider setup](docs/GETTING_STARTED.md#common-workflows) and the
[report, spreadsheet, and Git recipes](docs/WORKFLOWS.md).

## Current Capabilities

| Domain   | Useful commands                                             | Current behavior                                                               |
| -------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `ai`     | `providers`, `ask`                                          | Echo demo, Ollama, OpenAI, Anthropic; explicit input and network preview       |
| `dev`    | `status`, `review`, `commit`, `sync`                        | Git inspection, heuristic or AI review, commit suggestions, guarded sync       |
| `doc`    | `extract`, `convert`, `summary`, `outline`, `search`        | Text/HTML/PDF/DOCX extraction, Markdown conversion, local summaries and search |
| `data`   | `inspect`, `analyze`, `schema`, `sample`, `sheets`, `clean` | CSV/TSV/JSON/XLSX inspection; previewed cleaning for supported table formats   |
| `auto`   | `validate`, `plan`, `run`                                   | Workflow messages and bounded new-file writes; shell execution stays blocked   |
| `web`    | `inspect`, `fetch`                                          | Previewed HTTP requests with bounded responses and redirect rejection          |
| `teach`  | `plan`, `quiz`                                              | Template-based teaching outlines and practice-question drafts with CSV output  |
| `plugin` | `validate`, `install`, `list`, `remove`                     | Local plugin manifest management; manifests do not execute plugin code         |
| `config` | `show`, `path`, `validate`, `get`, `set`, `migrate`         | Project/global preferences, validation, previewed writes and migration         |

Commands use `zw <domain> <action> [target] [options]`. Discover an action with
`zw help data schema` or `zw data schema -h`; `--json` gives structured output.
See the [command catalog](docs/experience/COMMAND_CATALOG.md) for complete usage.

## Safety and Current Limits

- Use `--dry-run` to keep sensitive commands in preview mode, even with `--yes`.
  Boolean flags take no value: `--yes=false` is rejected.
- Preview fingerprints bind confirmation to the planned targets and content.
  Document/data outputs and automation file creation refuse existing targets.
  File paths are absolute; preview again after changing directories or upgrading
  from an older relative-path plan. Config updates also bind their original content.
- Network AI and web commands require confirmation. API keys belong in provider
  environment variables; ordinary config files reject secret-like keys.
- Document summaries and teaching drafts use local rules/templates. They are
  useful starting points; inspect their output before using it as finished work.
- A provider's explicit failure or incomplete-generation status is an error,
  including HTTP 200 replies containing partial text. No automatic continuation
  or retry resends an incomplete answer.
- Workflows currently support messages and structured new-file creation. Plugin
  management handles metadata. Broader workflow execution and distribution remain
  future work, tracked in the [roadmap](docs/ROADMAP.md).
- Production dependency auditing has no active exceptions; the DOCX dependency
  chain behind the previous exception has been removed. See the [dependency review](docs/security/dependency-review.md).

## Develop and Contribute

The monorepo uses TypeScript and pnpm `>=10.34.1 <11` through Corepack:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm --silent zw --help
```

Domain behavior belongs in its package under `packages/`; `packages/cli` composes
commands, and `packages/core` provides shared errors and operation plans. Every
public package is versioned and released together.

Start with [contributing](docs/CONTRIBUTING.md), the
[maintenance priorities](docs/MAINTENANCE.md), and the
[experience specification template](docs/experience/PRODUCT_SPEC_TEMPLATE.md).

[Getting Started](docs/GETTING_STARTED.md) · [Architecture](docs/ARCHITECTURE.md) ·
[Security](SECURITY.md) · [Support](SUPPORT.md) · [Privacy](docs/PRIVACY.md) ·
[Commercial direction](docs/COMMERCIALIZATION.md)
