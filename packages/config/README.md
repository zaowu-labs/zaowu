# @zaowu-labs/config

Configuration lifecycle package for ZaoWu.

This package resolves `zw.yml`, validates supported config keys, previews safe
config writes, and owns config migration behavior.

Safety:

- Config writes preview by default.
- Secret-like keys such as tokens, passwords, and API keys are rejected.
- YAML scalar edits preserve surrounding keys and comments, including flow
  mappings and multiline values. JSON config roots must be objects.
- Full rewrites refuse unknown keys, including keys named `constructor` or
  `__proto__`, rather than silently dropping user data.
- Future migrations should preserve a preview path before writing files.
