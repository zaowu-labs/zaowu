# Product Experience Spec: `zw init`

## 1. Summary

`zw init` previews or creates a starter ZaoWu config file.

## 2. Target User

Developers, technical creators, and small teams starting a project with ZaoWu.

## 3. Core Job

Create a local config foundation without silently writing files.

## 4. Golden Path

```bash
zw init
```

Expected output:

```text
ZaoWu Init

No files were written.

Would create:
  zw.yml

Preview:
  project:
    name: zaowu-project

  ai:
    provider: null

To create this file, run:
  zw init --yes
```

## 5. Command Design

```bash
zw init [options]
```

| Option      | Meaning                          | Required? |
| ----------- | -------------------------------- | --------- |
| `--json`    | Output machine-readable JSON     | No        |
| `--dry-run` | Preview without applying changes | No        |
| `--yes`     | Create the config file           | No        |

## 6. Input Rules

Reads the current directory and checks whether `zw.yml` already exists.

If the config already exists, ZaoWu must not overwrite it.

## 7. Output Rules

Default output is human-readable. `--json` returns valid JSON without extra text.

## 8. Safety Rules

Sensitive actions:

- Write files

Required safety behavior:

- Preview by default
- `--dry-run`
- Explicit `--yes` before writing

## 9. AI Behavior

This command does not use AI.

## 10. Error Cases

| Error                 | Why it happens             | User-facing fix                        |
| --------------------- | -------------------------- | -------------------------------------- |
| Config already exists | `zw.yml` already exists    | Open the existing config or run doctor |
| Write failed          | File system denied writing | Check permissions and retry            |

## 11. Help Text

Help text should include:

```text
Usage:
  zw init [options]

Examples:
  zw init
  zw init --dry-run
  zw init --yes
  zw init --json
```

## 12. Tests

- [x] preview without writing
- [x] confirmed write
- [x] existing config error
- [x] JSON output
- [x] help output

## 13. Documentation

- [x] README.md
- [x] docs/experience/ZW_INIT.md

## 14. Acceptance Criteria

- [x] Preview is the default behavior
- [x] `--yes` is required before writing
- [x] Existing files are not overwritten
- [x] `--json` is valid JSON
