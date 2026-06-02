# AGENTS.md

You are working on **ZaoWu / 造物**.

ZaoWu is an open-source AI-powered toolkit for development, automation, documents, data, teaching, and workflows.

The CLI command is:

```bash
zw
```

This repository should grow into one unified product, not a collection of unrelated scripts.

---

## Product Identity

* Product name: **ZaoWu / 造物**
* CLI command: `zw`
* Core idea: one unified AI-powered toolkit for developers, automation, documents, data, teaching, and plugins.
* First target users:

  * developers
  * technical creators
  * automation-heavy users
  * small teams

ZaoWu should feel like one coherent product, even when it contains many modules.

---

## Command Design Rules

All user-facing commands must follow this shape:

```bash
zw <domain> <action> [target] [options]
```

Good examples:

```bash
zw init
zw doctor
zw ai ask "Explain this project"
zw dev review
zw dev commit
zw doc summary report.pdf
zw data analyze sales.xlsx
zw auto run workflow.yml
zw plugin install readme-gen
```

Preferred top-level domains:

```text
ai
dev
doc
data
auto
web
teach
plugin
config
```

Avoid inconsistent command names such as:

```bash
zw review-code
zw pdf-summary
zw run-auto
zw askdoc
zw aiCommit
```

Do not rename public commands unless the related docs, tests, and experience specs are updated.

---

## Experience Principles

Every feature should follow these principles:

1. **One entry point**

   * Everything starts with `zw`.

2. **Predictable commands**

   * Commands should follow the same grammar across modules.

3. **Safe by default**

   * Dangerous actions must support preview, confirmation, or `--dry-run`.

4. **Human-readable first**

   * Default output should be easy for humans to read.

5. **Machine-readable when requested**

   * Use `--json` for structured output.

6. **Actionable errors**

   * Error messages must explain:

     * what failed
     * why it failed
     * how to fix it

7. **Transparent AI behavior**

   * When AI is used, the command should make it clear what input is being used and what output is being produced.

8. **No magic without control**

   * Users should understand what ZaoWu is about to read, write, execute, or modify.

---

## Safety Rules

Any action that does one or more of the following must be treated as sensitive:

* writes files
* deletes files
* modifies Git state or Git history
* runs shell commands
* accesses secrets
* sends network requests
* submits forms
* installs dependencies
* changes system-level configuration

Sensitive actions must support at least one of:

* preview
* confirmation
* `--dry-run`

For destructive actions, confirmation should be required by default.

Do not silently overwrite user files.

Do not automatically run `git commit`, `git push`, dependency installation, or destructive shell commands unless the user explicitly requested it.

---

## Output Rules

Default output should be human-readable.

Good output:

```text
ZaoWu Doctor

Status: Warning

Checks:
- Node.js: ok v20.11.0
- Git: ok 2.44.0
- pnpm: missing
- Config: missing

Next steps:
1. Install pnpm:
   corepack enable

2. Initialize ZaoWu:
   zw init
```

When `--json` is used:

* output must be valid JSON
* do not print extra human-readable text
* include stable keys where possible
* include status fields for automation

---

## Error Message Rules

Bad error:

```text
fatal error
```

Good error:

```text
Error: Git repository not found.

Why:
ZaoWu could not find a `.git` directory in the current folder or its parent folders.

How to fix:
Run this command inside a Git repository:

  cd your-project
  zw dev review
```

Expected errors should be formatted consistently.

Raw stack traces should not be shown by default. Use debug or verbose output for technical details.

---

## Engineering Rules

Use these defaults unless there is a strong reason not to:

* TypeScript
* Node.js 20+
* pnpm workspace
* modular packages
* small dependencies
* tests for new behavior
* readable code over clever code

Do not introduce large dependencies without explaining why.

Do not implement unrelated features while working on a specific task.

Do not mix product design changes with unrelated refactors.

Do not create cloud services, desktop apps, plugin marketplaces, or long-running autonomous agents until the basic CLI foundation is stable.

---

## Documentation Rules

When a command changes, update the relevant docs.

Every important command should have:

* command description
* basic example
* common failure case
* useful options
* expected output example when appropriate

Before implementing a new module or major command, create or update a product experience spec under:

```text
docs/experience/
```

---

## Testing Rules

New behavior should include tests where practical.

At minimum, test:

* happy path
* missing input
* invalid input
* important error paths
* `--json` output if supported
* `--dry-run` behavior if supported

---

## Before Finishing Any Task

Before finishing, provide:

1. What changed
2. Files changed
3. Tests run
4. Manual verification commands
5. Known risks or follow-up work

---

## Current Project Phase

The project is currently in the early foundation phase.

Priority order:

1. experience foundation
2. monorepo setup
3. minimal `zw` CLI
4. standard error system
5. `zw doctor`
6. config system
7. AI provider abstraction
8. `zw dev commit`
9. `zw dev review`

Do not jump ahead to full agents, desktop apps, cloud services, plugin markets, or browser automation until the foundation is stable.
