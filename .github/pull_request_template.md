## Summary

What changed?

```text
Write a short summary here.
```

---

## Type of Change

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Documentation
- [ ] Test
- [ ] Chore
- [ ] Security

---

## User Experience Checklist

- [ ] Feature command names follow `zw <domain> <action> [target] [options]`
- [ ] Root commands are limited to lifecycle commands such as `zw init` and `zw doctor`
- [ ] Human-readable output is clear
- [ ] `--json` output is valid if supported
- [ ] Error messages explain what failed, why it failed, and how to fix it
- [ ] Dangerous actions require preview, confirmation, or `--dry-run`
- [ ] Help text includes practical examples
- [ ] The Golden Path is documented or updated
- [ ] Behavior feels consistent with existing ZaoWu commands

---

## Safety Checklist

- [ ] This change does not write, delete, execute, or modify user state
- [ ] Or sensitive actions are protected by confirmation, preview, or `--dry-run`
- [ ] This change does not silently overwrite user files
- [ ] This change does not expose secrets
- [ ] This change does not add unexpected network access

---

## Engineering Checklist

- [ ] Tests added or updated
- [ ] Documentation added or updated
- [ ] No unrelated files changed
- [ ] No unnecessary large dependencies added
- [ ] Public commands were not renamed
- [ ] Existing behavior remains compatible unless documented

---

## Manual Verification

Commands run:

```bash
# Example:
pnpm test
pnpm build
pnpm dev -- --help
```

Manual result:

```text
Write result here.
```

---

## Screenshots or Output Examples

If this changes CLI output, paste an example.

```text
Example output here.
```

---

## Related Issue

Closes #

---

## Follow-up Work

```text
List follow-up tasks or known risks here.
```
