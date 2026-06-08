# ZaoWu CLI Style Guide

This document defines the command-line interface style for **ZaoWu / 造物**.

The CLI command is:

```bash
zw
```

All ZaoWu commands should feel consistent, predictable, and safe.

---

## Command Grammar

Feature commands should follow this structure:

```bash
zw <domain> <action> [target] [options]
```

Examples:

```bash
zw dev review
zw dev commit
zw doc summary report.pdf
zw ai ask "What are the risks?" --file contract.pdf
zw data analyze sales.xlsx
zw auto run workflow.yml
zw plugin install readme-gen
```

Users should be able to guess future commands after learning a few examples.

Root lifecycle commands are limited to setup, diagnostics, and global metadata:

```bash
zw init
zw doctor
zw --help
zw --version
```

Do not add root commands for feature modules. Use a domain and action instead.

---

## Top-Level Domains

Preferred top-level domains:

| Domain   | Purpose                                  |
| -------- | ---------------------------------------- |
| `ai`     | Basic AI interaction and model utilities |
| `dev`    | Developer tools                          |
| `doc`    | Document processing                      |
| `data`   | Data processing and analysis             |
| `auto`   | Automation workflows                     |
| `web`    | Web utilities                            |
| `teach`  | Programming teaching and learning        |
| `plugin` | Plugin management                        |
| `config` | Configuration management                 |

Avoid creating new top-level domains unless there is a strong reason.

Domain entry points may exist before their actions are implemented. In that
case, `zw <domain> --help` should list planned actions, and
`zw <domain> <action>` should return an actionable "not implemented yet" error
instead of silently doing nothing.

---

## Common Actions

Preferred action names:

| Action    | Meaning                                  |
| --------- | ---------------------------------------- |
| `ask`     | Ask a question                           |
| `run`     | Run a workflow or task                   |
| `review`  | Review something                         |
| `commit`  | Generate or manage commit-related output |
| `summary` | Summarize a target                       |
| `analyze` | Analyze a target                         |
| `gen`     | Generate something                       |
| `fix`     | Fix or suggest fixes                     |
| `list`    | List resources                           |
| `install` | Install a plugin or resource             |
| `remove`  | Remove a plugin or resource              |
| `init`    | Initialize configuration                 |
| `doctor`  | Check environment health                 |

Prefer short, predictable verbs.

---

## Naming Rules

Use lowercase command names.

Good:

```bash
zw dev review
zw doc summary
zw plugin install
```

Bad:

```bash
zw Dev Review
zw docSummary
zw plugin-install
```

Use spaces to express hierarchy.

Good:

```bash
zw dev test gen
```

Avoid compressed names:

```bash
zw dev-test-gen
zw gentest
```

---

## Global Options

Use these option names consistently:

| Option                      | Meaning                                       |
| --------------------------- | --------------------------------------------- |
| `--help`                    | Show help                                     |
| `--version`                 | Show version                                  |
| `--json`                    | Output machine-readable JSON                  |
| `--verbose`                 | Show more details                             |
| `--quiet`                   | Show less output                              |
| `--dry-run`                 | Preview without applying changes              |
| `--yes`                     | Skip confirmation where safe                  |
| `--plan-fingerprint <hash>` | Require the confirmed plan to match a preview |
| `--config <path>`           | Use a specific config file                    |
| `--model <model>`           | Use a specific AI model                       |
| `--lang <lang>`             | Choose output language                        |

Avoid duplicate option names such as:

```bash
--machine
--format-json
--simulate
--no-write
```

Use the standard option names above whenever possible.

---

## Default Output

Default output should be human-readable.

Good output:

```text
ZaoWu Doctor

Status: Warning

Checks:
- Node.js: ok v20.19.0
- Git: ok 2.44.0
- pnpm: missing
- Config: missing

Next steps:
1. Install pnpm:
   corepack enable

2. Initialize ZaoWu:
   zw init
```

Avoid unclear output:

```text
node ok git ok pnpm missing config missing
```

---

## JSON Output

When `--json` is used:

- output must be valid JSON
- do not print extra human-readable text
- include stable keys where possible
- include status fields for automation

Example:

```json
{
  "status": "warning",
  "checks": [
    {
      "name": "node",
      "status": "ok",
      "version": "v20.19.0"
    },
    {
      "name": "pnpm",
      "status": "missing",
      "fix": "Run `corepack enable`."
    }
  ]
}
```

---

## Error Format

Expected errors should follow this format:

```text
Error: <short message>

Why:
<clear explanation>

How to fix:
<actionable fix>
```

Example:

```text
Error: No staged changes found.

Why:
`zw dev commit` reads staged Git changes by default, but there are no staged files.

How to fix:
Stage files first:

  git add .
  zw dev commit
```

For `--json`, errors should also be structured:

```json
{
  "error": {
    "code": "NO_STAGED_CHANGES",
    "message": "No staged changes found.",
    "why": "`zw dev commit` reads staged Git changes by default.",
    "fix": "Run `git add .` and try again."
  }
}
```

---

## Confirmation Style

For sensitive actions, use clear confirmation prompts.

Example:

```text
ZaoWu wants to write:

  zw.yml

Continue? [y/N]
```

Default should be `No` for destructive actions.

Use `--yes` only when the user explicitly accepts risk or the action is safe to automate.

---

## Dry Run Style

For commands that support `--dry-run`, show what would happen.

Example:

```bash
zw init --dry-run
```

Output:

```text
Dry run: no files were written.

Would create:

  zw.yml

Preview:

  project:
    name: my-project
```

---

## Progress Style

Long-running commands should show simple progress.

Example:

```text
Reading staged diff...
Calling AI model...
Generating review...
Done.
```

Avoid excessive logs by default.

Use `--verbose` for detailed logs.

---

## Help Text

Every command should have useful help.

Example:

```text
Usage:
  zw dev commit [options]

Description:
  Generate a commit message from staged Git changes.

Options:
  --lang <lang>    Output language: en or zh
  --json           Output JSON
  --model <model>  Use a specific AI model

Examples:
  git add .
  zw dev commit
  zw dev commit --lang zh
  zw dev commit --json
```

Help text should include at least one practical example.

---

## Anti-Patterns

Avoid these patterns.

### Inconsistent command names

Bad:

```bash
zw review-code
zw commit-ai
zw pdf-summary
```

### Hidden writes

Bad:

```bash
zw dev commit
```

Then silently running:

```bash
git commit
```

Instead, suggest first. Commit only when explicitly requested.

### Raw technical errors

Bad:

```text
TypeError: Cannot read properties of undefined
```

Use a user-facing error when possible.

### Unclear AI behavior

Bad:

```text
Done.
```

Good:

```text
Generated a commit message from staged Git diff.
No commit was created automatically.
```

---

## Release Stability

Once a public command is documented, changing it is a breaking change.

Before changing command behavior:

- update the product spec
- update docs
- update tests
- consider a deprecation path
