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
- Config reads are limited to one MiB. Confirmations bind the original source
  (including comments) and generated output; changed input requires a new preview.
- Writes use a complete temporary sibling and final source check before replacing
  an existing regular file. Permissions are preserved; linked config targets are
  refused. New configs are created exclusively with private default permissions.
- Replacement protects against partial-file writes and detected concurrent edits;
  it is not a conditional filesystem transaction with unrelated external writers.
