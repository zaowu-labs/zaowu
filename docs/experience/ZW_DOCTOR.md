# Product Experience Spec: `zw doctor`

## 1. Summary

`zw doctor` checks whether the local environment is ready to run ZaoWu.

## 2. Target User

Developers, technical creators, small teams, and learners setting up ZaoWu.

## 3. Core Job

Identify missing local prerequisites and give actionable next steps.

## 4. Golden Path

```bash
zw doctor
```

Expected output:

```text
ZaoWu Doctor

Status: Warning

Checks:
- Node.js: ok v20.11.0
- Git: ok 2.44.0
- pnpm: missing
- Config: missing

Next steps:
1. Run `corepack enable` or install pnpm.
2. Run `zw init` to preview config creation, then `zw init --yes` to create it.
```

## 5. Command Design

```bash
zw doctor [options]
```

| Option   | Meaning                      | Required? |
| -------- | ---------------------------- | --------- |
| `--json` | Output machine-readable JSON | No        |

## 6. Input Rules

Reads:

- current Node.js version
- local Git availability
- local pnpm availability, including pnpm provided through Corepack
- nearest ZaoWu config file

## 7. Output Rules

Default output is human-readable. `--json` returns valid JSON without extra text.

## 8. Safety Rules

Sensitive actions:

- Run shell commands

Required safety behavior:

- Read-only checks only
- No file writes
- No dependency installation
- No Git state changes

## 9. AI Behavior

This command does not use AI.

## 10. Error Cases

Expected missing prerequisites should be shown as checks, not raw stack traces.

| Error          | Why it happens       | User-facing fix                         |
| -------------- | -------------------- | --------------------------------------- |
| Missing Git    | Git is not on PATH   | Install Git and make sure it is on PATH |
| Missing pnpm   | pnpm is not on PATH  | Run `corepack enable` or install pnpm   |
| Missing config | No config file found | Run `zw init`, then `zw init --yes`     |

## 11. Help Text

Help text should include:

```text
Usage:
  zw doctor [options]

Examples:
  zw doctor
  zw doctor --json
```

## 12. Tests

- [x] happy path
- [x] missing tools
- [x] `--json` output
- [x] config discovery
- [x] help output

## 13. Documentation

- [x] README.md
- [x] docs/experience/ZW_DOCTOR.md

## 14. Acceptance Criteria

- [x] Human output is readable
- [x] JSON output is valid
- [x] Missing prerequisites produce actionable next steps
- [x] The command does not write files or modify Git state
