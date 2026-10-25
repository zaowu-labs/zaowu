# Practical workflows

ZaoWu connects local files, data, developer work, and explicitly selected models
through one CLI. These recipes use existing commands. Each write or model request
has its own visible plan; a prior approval does not authorize a later step.

## Read a DOCX report, then ask a model

Start with local inspection:

```bash
zw doc outline report.docx
zw doc summary report.docx
zw doc convert report.docx --format markdown --output report.md
```

The summary is an extractive heuristic, not a model answer. Inspect the conversion
preview and copy its complete confirmation command, including the fingerprint.
It creates `report.md` only if that path does not already exist. Open the result
and remove private material before sending it to a provider.

```bash
zw ai ask "Find decisions, unresolved questions, and next actions. Cite source headings." --file report.md --provider openai --output actions.md
```

This displays the input size and endpoint without sending a request. Copy its
complete confirmation command after reviewing the plan. Changes to the file,
prompt, provider, or model invalidate the old fingerprint. Execution also rejects
content that changes after the plan is checked but before writing/sending. Human answers stream;
Ctrl+C stops the request with exit code 130. `--json` produces one complete result.
The new `actions.md` contains only the completed model answer. Its directory must
exist; output conflicts are rejected before contacting the provider. Files created
by another program during generation are preserved. Failed/cancelled generation
creates no answer file. If saving fails after generation, the error explains that
the request may already have been billed and was not retried.

Use `--provider ollama --model <installed-model>` for an explicitly chosen local
Ollama endpoint. HTTP requests to localhost still need confirmation.

## Inspect a spreadsheet before cleaning or interpreting it

```bash
zw data sheets sales.xlsx
zw data inspect sales.xlsx --sheet Sales
zw data schema sales.xlsx --sheet Sales
zw data analyze sales.xlsx --sheet Sales
zw data clean sales.xlsx --sheet Sales --output sales-clean.csv
```

`count` in numeric analysis means valid numeric cells. `missingCount` and
`nonNumericCount` explain excluded cells. ZaoWu does not fill missing values,
execute formulas, or infer units. Check mixed columns before interpreting means.
Cleaning previews a new CSV; copy the displayed confirmation command to create
it. The original workbook remains unchanged. Do not send an entire workbook to
`ai ask --file`, which accepts UTF-8 text. Choose a small, reviewed text extract.

## Review a change, then prepare a commit

```bash
zw dev status
zw dev review --worktree
```

Untracked paths are listed by name; their contents are not reviewed. Stage the
intended files yourself, then inspect exactly the staged diff:

```bash
zw dev review --staged
zw dev commit
zw dev review --staged --ai --provider openai
```

The first two commands use local heuristics. The third previews a model request;
copy its confirmation command to send the displayed diff context. AI findings
carry `origin: "ai"`, and `method` identifies heuristic, AI-assisted, or Echo
diagnostic output. Neither review nor commit suggestions create Git commits.
Run the recommended checks and review the final message before committing.

## Boundaries and recovery

- Use fresh output paths. Existing files are never overwritten by these recipes.
- A failed extraction or model call stops that step; do not treat partial output
  as a completed result. Previously created files remain available for inspection.
- Document/data inputs are limited to 20 MiB. DOCX requested XML parts are limited
  to 8 MiB; extracted document text to two million characters. Scanned PDFs need OCR.
- Tables allow 250,000 data rows, 1,024 columns, and two million cells. XLSX
  decompression is limited to 64 MiB and 2,000 entries.
- Model input is limited to 200,000 characters. Large Git diffs disclose their
  100,000-character AI context limit. Review smaller staged changes for full coverage.
- Workflow shell/network steps and plugin-code execution remain blocked. These
  recipes do not grant workflows authority to execute arbitrary `zw` commands.
