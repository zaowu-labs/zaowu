# @zaowu/auto

Automation workflow package for ZaoWu.

This package validates JSON or YAML workflow files, builds execution plans, and
previews workflow runs. It owns workflow permissions, runtime policy output, and
the foundation execution sandbox for automation commands.

Safety:

- Workflow runs preview by default.
- Shell commands are planned but blocked in this foundation version.
- File writes and network access remain blocked by the execution sandbox.
