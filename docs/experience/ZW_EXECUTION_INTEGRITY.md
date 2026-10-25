# Execution integrity review

## 1. Feature Name

Consistent paths, durable confirmed writes, and complete provider responses.

## 2. Problem

Relative targets can produce the same confirmation fingerprint in different
directories. Configuration and plugin operations can consume changed input after
verification. JSON model responses can contain incomplete text despite HTTP 200.
Small metadata and workflow inputs still have unbounded file reads.

## 3. Target Users

Developers, technical creators, and small teams using the published CLI or CLI API.

## 4. User Story

Preview an operation, confirm its exact paths/content, receive a complete result,
and retain existing files when a write fails or input changes.

## 5. Command Design

Keep existing command names and options. Resolve file inputs/outputs against the
command's working directory, disclose absolute paths, and preserve literal topics
and plugin ids. Old relative-path fingerprints require a fresh preview.

## 6. Golden Path

Run document/data commands inside a project, copy the displayed confirmation,
and create exactly the previewed output. Configuration updates preserve comments
and permissions, replace complete files, and reject stale content. JSON AI output
is successful only when the provider has not reported truncation or failure.

## 7. Inputs and Outputs

No JSON keys are removed. Paths for file operations become absolute. Config and
plugin metadata are limited to one MiB. Workflow bytes are bounded before parsing
under the existing character limit. Teaching file input is bounded and retains
literal-topic behavior for nonexistent paths. Invalid installed plugin metadata
is represented by the existing unreadable-manifest result, never arbitrary JSON.

## 8. AI Behavior

Reject explicit incomplete/failed/cancelled/pending OpenAI statuses, unfinished
Ollama replies, and non-final Anthropic stop reasons. Apply this to JSON and
streams. Keep compatibility with proxies omitting completion metadata, but never
ignore explicit failure/error fields. No automatic continuation or retry after
reading an incomplete answer. No real model credentials are needed for tests.

## 9. Safety

Bind write targets to their working directory. Recheck confirmed configuration
output and original file content before replacement. Write complete config files
through a temporary sibling, preserve permissions, refuse redirected targets, and
clean temporary files on failure. New files use exclusive creation semantics.
Plugin removal rechecks the confirmed manifest state before unlinking it.
Do not claim atomic comparison with unrelated external filesystem writers.
Workflow variables use own properties, so prototype names cannot grant values.
Web requests always abort/close unused or failed bodies; cleanup cannot hang.

## 10. Errors

Changed plans use OPERATION_PLAN_MISMATCH. Config filesystem failures use
CONFIG_WRITE_FAILED. Incomplete model output uses AI_PROVIDER_RESPONSE_INVALID
with a retry/setup hint, never a success containing partial text. Size errors
explain the applicable limit and how to reduce the input.

## 11. Help Text

Update guides for absolute target disclosure, metadata limits, complete-answer
checks, and preserved confirmation requirements.

## 12. Tests

Reproduce cross-directory confirmation, custom cwd file reads, config input races,
failed/redirected writes, invalid installed manifests, prototype variables,
incomplete JSON responses, bounded reads, and response cleanup before fixing.
Retain happy paths, JSON, dry-run, missing/invalid input, and six-platform checks.

## 13. Documentation

Update package READMEs, command contracts/guide where relevant, error registry and
schema for any added code, changelog, maintenance notes, and dated review evidence.

## 14. Acceptance Criteria

Focused regressions, full verification, and production audit pass. Release from
green canonical main, then verify all eleven registry versions, provenance,
signatures, fresh installation, and representative installed commands.

## 15. Open Questions

OCR, formula evaluation, shell workflow execution, and plugin-code execution
remain outside this patch. Native conditional filesystem transactions and live
model access are not claimed by these checks.
