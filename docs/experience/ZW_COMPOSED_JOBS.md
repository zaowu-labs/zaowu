# Composed jobs

## 1. Feature Name

Explicit file-to-model and change-to-review recipes.

## 2. Problem

Users need repeatable outcomes across domains without hidden file reads, network
requests, or execution privileges.

## 3. Target Users

Developers, technical creators, and small teams processing local reports/tables.

## 4. User Story

Extract a report locally, inspect the output, then choose a model to interpret it;
inspect a table before cleaning it; review changes before preparing a commit.

## 5. Command Design

Use existing `doc`, `data`, `ai`, and `dev` actions described in
[Practical workflows](../WORKFLOWS.md). No implicit pipeline runner is introduced.

## 6. Golden Path

`doc outline` → `doc convert --output` preview → confirmed create-only write →
human inspection → `ai ask --file` preview → separately confirmed request.

## 7. Inputs and Outputs

Inputs are explicit paths, sheet names, staged/unstaged diff selection, provider,
and model. Intermediate files belong to the user and survive downstream failure.
JSON envelopes stay independently parseable. Binary documents are converted to
reviewed UTF-8 text before `ai ask --file`.

## 8. AI Behavior

Only explicitly selected model steps send input. Local summaries/rules and Echo
diagnostics are labeled. AI sees the prepared text/diff, not the entire project.

## 9. Safety

Every write and network step has its own plan fingerprint, covering its exact
input/output or payload/endpoint. File or prompt changes invalidate confirmation.
No approval transfers to later steps. The CLI composes domains; domain packages
do not import one another. No shell execution, inherited workflow authority,
automatic commits, or automatic retries after partial model output.

## 10. Errors

Stop at the failed command, preserve existing files, show why/how to recover.
Do not continue with stale intermediate content after a failed conversion.

## 11. Help Text

Each action retains its normal help. The guide explains where to inspect output
and which full confirmation command to copy.

## 12. Tests

Test conversion preview/no write, confirmed creation, file-bound AI preview,
fingerprint rejection after edits, and zero provider calls on stale approval.

## 13. Documentation

README links to the recipes; package guides document limits and non-model output.

## 14. Acceptance Criteria

Recipes work with the installed CLI, preserve files/Git state, and expose each
approval boundary. Changes to intermediates cannot reuse old authorization.

## 15. Open Questions

A future structured runner needs typed inputs/results, per-step plans, aggregate
approval semantics, failure receipts, and dedicated execution tests before implementation.
