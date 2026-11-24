# @zaowu-labs/auto

Automation workflow package for ZaoWu.

This package validates JSON or YAML workflow files, builds execution plans, and
previews workflow runs. It owns workflow permissions, runtime policy output, and
the foundation execution sandbox for automation commands.

Use `planWorkflowFile("workflow.yml")` in Node.js or `zw auto plan workflow.yml --json`
with the [ZaoWu CLI](https://www.npmjs.com/package/@zaowu-labs/cli) to inspect the planned steps and permissions.

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
- Only version 1 can authorize file writes; malformed/future versions cannot
  execute them. Variables must be explicitly defined, including prototype names.
- Workflow input is limited to four MiB before decoding and one million text
  characters before parsing. JSON roots must be objects.
- YAML and JSON accept `vars` and `variables` as objects with string, number
  or boolean values. Omit the field or use `{}` for an empty map. When both
  aliases are present, both must be valid. YAML uses `vars` and JSON uses
  `variables` in that case. Text substitutions preserve spaces and line breaks.
  Each `writeFile` action requires a string path and string content. Use
  `content: ""` for an empty file.
- Confirmed runs check output directories and existing or duplicate destinations
  before creating workflow outputs. When names differ only in case or Unicode
  spelling, a temporary directory in the destination checks whether the volume
  treats them as distinct. The run removes the probe and creates each output
  exclusively. Preview creates no files or directories.
  Filesystem failures during execution can still leave earlier outputs in place.
