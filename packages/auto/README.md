# @zaowu-labs/auto

Automation workflow package for ZaoWu.

This package validates JSON or YAML workflow files, builds execution plans, and
previews workflow runs. It owns workflow permissions, runtime policy output, and
the foundation execution sandbox for automation commands.

Safety:

- Workflow runs preview by default.
- Shell commands are planned but blocked in this foundation version.
- Structured `writeFile` steps require `permissions.fileWrites: prompt` and
  explicit confirmation.
- Confirmed writes can only create new files inside the real workflow-directory
  sandbox; existing files and linked-directory escapes are refused.
- Network access remains blocked by the execution sandbox.
- The sandbox reports the resolved workflow directory and active file-write
  boundary.
- Plan steps include per-step operation plans so callers can audit risk and
  planned execution before running.
