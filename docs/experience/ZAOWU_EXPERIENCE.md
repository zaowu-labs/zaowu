# ZaoWu Experience Principles

This document defines the product experience principles for **ZaoWu / 造物**.

ZaoWu is not just a group of tools. It should feel like one coherent system.

The CLI command is:

```bash
zw
```

---

## Product Statement

**ZaoWu / 造物** is an open-source AI-powered toolkit for development, automation, documents, data, teaching, and workflows.

ZaoWu helps users review code, generate commits, process documents, analyze data, automate workflows, learn programming, and extend the system through plugins.

---

## Product Promise

ZaoWu should help users turn repeated work into reliable workflows.

It should be:

* useful before it is fancy
* safe before it is powerful
* consistent before it is large
* transparent before it is automatic
* extensible before it is complicated

---

## Target Users

### Developers

They use ZaoWu to:

* review code
* generate commit messages
* understand codebases
* create docs
* generate tests
* automate development workflows

### Technical creators

They use ZaoWu to:

* process files
* summarize documents
* analyze structured data
* automate repetitive tasks

### Small teams

They use ZaoWu to:

* standardize AI workflows
* share prompts
* enforce safe automation
* reduce manual operational work

### Learners

They use ZaoWu to:

* learn programming through projects
* understand errors
* receive guided coding feedback

---

## Core Experience Principles

### 1. One entry point

Everything should begin with:

```bash
zw
```

Good:

```bash
zw dev review
zw doc summary report.pdf
zw auto run workflow.yml
```

Bad:

```bash
zaowu-review
zw-pdf
doc-ai
run-auto
```

---

### 2. Predictable command structure

Commands should follow:

```bash
zw <domain> <action> [target] [options]
```

Examples:

```bash
zw dev commit
zw dev review
zw doc ask contract.pdf "What are the risks?"
zw data analyze sales.xlsx
zw auto run daily.yml
```

Users should be able to guess future commands after learning a few.

---

### 3. Safe by default

ZaoWu may read files, write files, run commands, call AI models, modify Git state, and automate workflows.

Default behavior should avoid surprising changes.

Dangerous operations must support at least one of:

* preview
* confirmation
* `--dry-run`

Destructive operations should require confirmation by default.

---

### 4. Human-readable by default

Most users interact with ZaoWu in a terminal.

Default output should be clear, structured, and readable.

Good output:

```text
ZaoWu Code Review

Risk: Medium

Issues:
1. src/auth/login.ts
   Token expiration is not handled.

2. src/api/user.ts
   Missing error handling.

Suggested next steps:
- Add token expiration check.
- Add unit tests for login failure cases.
```

JSON is useful, but it should not be the default human experience.

---

### 5. Machine-readable when requested

When a command may be used in scripts or CI, it should support:

```bash
--json
```

Example:

```bash
zw doctor --json
zw dev review --json
```

`--json` output should be valid JSON and should not contain extra human text.

---

### 6. Errors must help users recover

Every expected error should explain:

1. what failed
2. why it failed
3. how to fix it

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

Errors should never expose raw stack traces unless the user requests debug output.

---

### 7. AI behavior must be transparent

When a command uses AI, users should understand:

* what files or diffs are being used as input
* which task the AI is performing
* whether ZaoWu will only suggest changes or actually modify files
* whether the output can be reviewed before applying

Example:

```text
Input:
- staged Git diff

AI task:
- generate a conventional commit message

Action:
- suggest only, no commit will be created automatically
```

---

### 8. Progressive complexity

A new user should be able to run a simple command quickly.

An advanced user should be able to configure and automate deeply.

Good design:

```bash
zw dev review
zw dev review --json
zw dev review --model gpt-4.1
zw dev review --config ./zw.yml
```

The simple path must stay simple.

---

### 9. Consistent module behavior

Different modules should feel familiar.

For example:

```bash
zw dev review --json
zw doc summary report.pdf --json
zw data analyze sales.xlsx --json
```

All should follow similar patterns for:

* help text
* options
* errors
* progress
* JSON output
* dry-run behavior

---

### 10. No hidden destructive behavior

ZaoWu must not silently:

* overwrite files
* delete files
* commit changes
* push to remote repositories
* install dependencies
* submit forms
* run unknown shell commands

Users must stay in control.

---

## Golden Path Requirement

Every major command must define a Golden Path.

A Golden Path is the simplest successful user flow.

Example for `zw dev commit`:

```bash
git add .
zw dev commit
```

Expected behavior:

```text
ZaoWu Commit

Suggested commit message:

feat(dev): add git diff analyzer

No commit was created automatically.
To commit with this message, run:

  git commit -m "feat(dev): add git diff analyzer"
```

The Golden Path should be documented before implementation.

---

## Early Non-Goals

Early ZaoWu should not try to be everything.

Avoid building these too early:

* full desktop application
* cloud account system
* plugin marketplace
* autonomous long-running agents
* browser automation
* team permission system
* paid enterprise features

The early product should prove that `zw` is useful, safe, and consistent.

---

## Experience Acceptance Bar

A feature is not ready if:

* the command name feels inconsistent
* the help text is unclear
* the output is hard to read
* errors do not explain how to recover
* dangerous actions do not support confirmation or preview
* documentation is missing
* tests do not cover important error paths
* the feature adds complexity without a clear Golden Path

A feature is ready when:

* the command is predictable
* the simplest use case works
* the user can understand the output
* failures are recoverable
* behavior is documented
* tests pass
* the feature feels like part of ZaoWu, not an isolated script
