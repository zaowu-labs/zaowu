# Product Experience Spec: <Module or Command Name>

Use this template before implementing a new ZaoWu module or major command.

This document should describe the user experience before implementation begins.

---

## 1. Summary

What is this module or command?

Example:

```text
`zw dev commit` suggests a structured commit message from staged Git changes.
```

---

## 2. Target User

Who is this for?

- Developer
- Technical creator
- Small team
- Learner
- Plugin author
- Other

Describe the user briefly.

Example:

```text
A developer who has staged changes and wants a clear commit message without writing one manually.
```

---

## 3. Core Job

What job is the user trying to complete?

Example:

```text
Turn staged Git changes into a useful commit message without modifying Git state.
```

---

## 4. Golden Path

What is the simplest successful use case?

Example:

```bash
git add .
zw dev commit
```

Expected output:

```text
ZaoWu Dev Commit

No Git state was modified.

Suggested commit:

feat(dev): update dev

Suggested body:

- Staged files: 2.
- Change size: +15/-2.
- Categories: source=1, test=1.

Findings:

- none
```

---

## 5. Command Design

List the command or commands.

Command shape:

```bash
zw <domain> <action> [target] [options]
```

Commands:

```bash
zw ...
```

Options:

| Option            | Meaning                          | Required? |
| ----------------- | -------------------------------- | --------- |
| `--json`          | Output machine-readable JSON     | No        |
| `--dry-run`       | Preview without applying changes | No        |
| `--model <model>` | Use a specific AI model          | No        |
| `--lang <lang>`   | Choose output language           | No        |

---

## 6. Input Rules

What input does the command read?

Possible inputs:

- current directory
- Git diff
- file path
- user prompt
- config file
- environment variable
- workflow file

Input rules:

```text
Write rules here.
```

What happens if input is missing?

```text
Write behavior here.
```

---

## 7. Output Rules

Default human-readable output:

```text
Write example output here.
```

JSON output if supported:

```json
{
  "status": "ok"
}
```

Should this command support `--json`?

- [ ] Yes
- [ ] No

---

## 8. Safety Rules

Does this command do any sensitive action?

- [ ] Read files
- [ ] Write files
- [ ] Delete files
- [ ] Run shell commands
- [ ] Modify Git state
- [ ] Access network
- [ ] Access secrets
- [ ] Submit forms
- [ ] Install dependencies

Required safety behavior:

- [ ] Preview
- [ ] Confirmation
- [ ] `--dry-run`
- [ ] Not needed

Explain:

```text
Write safety explanation here.
```

---

## 9. AI Behavior

Does this command use AI?

- [ ] Yes
- [ ] No

If yes, describe the AI behavior.

### AI input

```text
What content is sent to the AI model?
```

### AI task

```text
What should the AI do?
```

### AI output

```text
What should the AI return?
```

### User control

```text
Can the user preview, reject, edit, or apply the result?
```

---

## 10. Error Cases

List expected errors.

| Error          | Why it happens                        | User-facing fix        |
| -------------- | ------------------------------------- | ---------------------- |
| Missing input  | User did not provide required input   | Show usage example     |
| Invalid file   | File does not exist or cannot be read | Ask user to check path |
| Missing config | Config not found                      | Suggest `zw init`      |

Expected error format:

```text
Error: <message>

Why:
<why this happened>

How to fix:
<actionable fix>
```

---

## 11. Help Text

Expected help output:

```text
Usage:
  zw ...

Description:
  ...

Options:
  ...

Examples:
  ...
```

Every important command should include at least one practical example.

---

## 12. Tests

Required tests:

- [ ] happy path
- [ ] missing input
- [ ] invalid input
- [ ] important error path
- [ ] `--json` output
- [ ] `--dry-run` behavior
- [ ] help output

Additional tests:

```text
Write additional tests here.
```

---

## 13. Documentation

Docs that must be updated:

- [ ] README.md
- [ ] docs/...
- [ ] command examples
- [ ] changelog
- [ ] plugin docs
- [ ] not needed

---

## 14. Acceptance Criteria

This feature is ready when:

- [ ] command follows `zw <domain> <action> [target] [options]`
- [ ] Golden Path works
- [ ] help text is clear
- [ ] output is human-readable by default
- [ ] `--json` is valid if supported
- [ ] errors are actionable
- [ ] sensitive actions are safe
- [ ] tests pass
- [ ] docs are updated
- [ ] no unrelated features were added

---

## 15. Open Questions

List unresolved product or engineering questions.

```text
- ...
```
