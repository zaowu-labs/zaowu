# @zaowu/config

Configuration lifecycle package for ZaoWu.

This package resolves `zw.yml`, validates supported config keys, previews safe
config writes, and owns config migration behavior.

Safety:

- Config writes preview by default.
- Secret-like keys such as tokens, passwords, and API keys are rejected.
- Future migrations should preserve a preview path before writing files.
