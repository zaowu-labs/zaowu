# Product experience: saved answers and trustworthy results

## 1. Summary

Complete the file-to-model workflow with `zw ai ask --output <path>`, and reject
ambiguous/corrupt inputs before presenting a successful result.

## 2. Target User

Developers, technical creators, and small teams turning reviewed local text into
reusable model-generated notes, explanations, or action lists.

## 3. Core Job

Preview the exact input, provider, and output destination; generate once; save only
a complete successful answer without CLI headings or an existing-file overwrite.

## 4. Golden Path

```bash
zw ai ask "List decisions and next actions" --file report.md --provider ollama --output actions.md
# Inspect the preview, then copy its full confirmation command.
```

A completed result says where it was saved. Human output can still stream. The
saved UTF-8 file contains the complete provider text only.

## 5. Command Design

Add optional `--output <path>` to `zw ai ask`. Existing names/options retain their
behavior. `--yes` confirms network and/or output creation; `--dry-run` always
previews, including with Echo. No new top-level command or dependency.

## 6. Input Rules

Existing prompt/file/provider/model limits apply. Output parents must already
exist and be writable; resolve the physical parent before planning. Existing
files, directories, links, and the input itself are conflicts. Fail before a paid
request when the destination is already unusable. Changed targets invalidate plans.
CSV rejects misplaced quotes instead of deleting literal data. Sheet selection is
explicit; nonexistent table files and oversized numeric options fail visibly.
Conflicting staged/worktree selections fail before running Git or a model.

## 7. Output Rules

CLI JSON adds optional `outputPath` and `wroteFile` only when saving was requested.
Preview has `output: null`, `wroteFile: false`, and the planned absolute destination.
Successful output retains the answer and reports the saved file. JSON stays one
valid result/error; no streaming text enters JSON. Terminal-only rendering escapes
control bytes so filenames, document/model text, and errors cannot operate the
terminal. Confirmation commands encode those arguments without live controls,
preserving their values in Bash/zsh and PowerShell. JSON and saved answer contents preserve the original text.

## 8. Safety Rules

Preview all requested writes, including local Echo. One plan binds input digest,
provider/model/endpoint, and output destination. Generated text is unknown at
preview; disclose that explicitly. Stage the complete answer in a private sibling
file, flush it, then create the destination exclusively. No partial final files,
no overwrite, no automatic retry after generation/write failure, no write after
cancellation or incomplete provider output. Clean own temporary files on failure.
An external file created during generation is preserved, with a recovery error.

## 9. AI Behavior

Send only the explicitly reviewed prompt/file. Human output may stream but the file
is published only after completion. Without `--output`, existing behavior remains.
No live paid model credentials are needed for validation.

## 10. Error Cases

Use `AI_OUTPUT_CONFLICT` for existing targets and `AI_OUTPUT_WRITE_FAILED` for
unusable parents or failed writes, with a new-output/retry hint and no false claim
that a model request was not made after generation. Existing cancellation/provider
errors retain their codes. Input ambiguity uses OPTION_VALUE_INVALID; malformed
CSV/table reads use domain errors. Never return success with silently changed data.

## 11. Help Text

Document the output option, create-only behavior, dry-run, copyable confirmation,
missing/existing directory failures, and local Echo example.

## 12. Tests

Cover local/network preview, JSON, dry-run, complete save/stream save, missing input,
existing/same/dangling-link output, missing/unwritable parent, cancellation,
incomplete provider output, target races, fingerprint changes, private file mode,
and temporary-file cleanup. Reproduce malformed CSV, false sheet success, unsafe
row counts, conflicting flags, and terminal-control rendering.

## 13. Documentation

Update README, Getting Started, practical recipes, AI package guide, command
catalog/capability matrix, JSON schema/contracts, error registry, changelog,
maintenance priorities, and a full nine-domain assessment with delivery evidence.

## 14. Acceptance Criteria

Golden path works from a fresh public installation. Full verification, audit,
six-platform CI, synchronized eleven-package publication, signature/provenance,
and installed-command acceptance pass. No gate is weakened.

## 15. Open Questions

Output parents are intentionally not created automatically. There is no overwrite
flag, output editing, hidden pipeline runner, shell execution, or plugin runner.
External directory replacement is not a filesystem transaction guarantee. Real
model quality/account access remains distinct from protocol/CLI correctness.

JSON serialization uses Unicode escapes for display controls while preserving
parsed values. Saved answer bytes remain the original UTF-8 text.
