export const ACTION_HELP: Record<string, Record<string, string>> = {
  ai: {
    ask: `ZaoWu AI Ask

Usage:
  zw ai ask [prompt] [--file <path>] [--provider <id>] [--model <name>] [options]

Description:
  Ask a registered provider with explicit prompt and optional file input.

Options:
  --file <path>      Include a readable text file as input
  --provider <id>    Provider id, defaults to echo
  --model <name>     Provider model hint
  --json             Output machine-readable JSON`,
    providers: `ZaoWu AI Providers

Usage:
  zw ai providers [--provider <id>] [options]

Description:
  List registered providers and show whether required configuration is present.

Options:
  --provider <id>    Validate one provider in detail
  --json             Output machine-readable JSON`,
  },
  auto: {
    validate: `ZaoWu Auto Validate

Usage:
  zw auto validate <workflow.json|workflow.yml|workflow.yaml> [options]

Description:
  Validate a JSON or YAML workflow without running it.

Options:
  --json             Output machine-readable JSON`,
    plan: `ZaoWu Auto Plan

Usage:
  zw auto plan <workflow.json|workflow.yml|workflow.yaml> [options]

Description:
  Show the dry execution plan, permissions, variable substitution, blocked steps, and warnings.

Options:
  --json             Output machine-readable JSON`,
    run: `ZaoWu Auto Run

Usage:
  zw auto run <workflow.json|workflow.yml|workflow.yaml> [--yes] [options]

Description:
  Preview a workflow by default. Confirmed runs execute supported message steps only.

Options:
  --dry-run          Force preview mode
  --yes              Confirm supported non-shell steps
  --json             Output machine-readable JSON`,
  },
  config: {
    show: `ZaoWu Config Show

Usage:
  zw config show [options]

Description:
  Show the resolved ZaoWu configuration.

Options:
  --json             Output machine-readable JSON`,
    path: `ZaoWu Config Path

Usage:
  zw config path [options]

Description:
  Print the resolved configuration file path.

Options:
  --json             Output machine-readable JSON`,
    validate: `ZaoWu Config Validate

Usage:
  zw config validate [options]

Description:
  Parse and validate the resolved configuration file.

Options:
  --json             Output machine-readable JSON`,
    get: `ZaoWu Config Get

Usage:
  zw config get <key> [options]

Description:
  Read one supported key, such as project.name or ai.provider.

Options:
  --json             Output machine-readable JSON`,
    set: `ZaoWu Config Set

Usage:
  zw config set <key> <value> [--yes] [options]

Description:
  Preview or write one supported configuration key. Secret-like keys are rejected.

Options:
  --dry-run          Force preview mode
  --yes              Write the updated config file
  --json             Output machine-readable JSON`,
    migrate: `ZaoWu Config Migrate

Usage:
  zw config migrate [--yes] [options]

Description:
  Preview or apply safe migrations to the current config file.

Options:
  --dry-run          Force preview mode
  --yes              Write the migrated config file
  --json             Output machine-readable JSON`,
  },
  data: {
    inspect: `ZaoWu Data Inspect

Usage:
  zw data inspect <file.csv|file.tsv|file.xlsx> [options]

Description:
  Inspect rows, columns, and missing values.

Options:
  --sheet <name>     XLSX sheet name, defaults to the first sheet
  --json             Output machine-readable JSON`,
    analyze: `ZaoWu Data Analyze

Usage:
  zw data analyze <file.csv|file.tsv|file.xlsx> [options]

Description:
  Analyze numeric columns in supported data files.

Options:
  --sheet <name>     XLSX sheet name, defaults to the first sheet
  --json             Output machine-readable JSON`,
    clean: `ZaoWu Data Clean

Usage:
  zw data clean <file.csv|file.tsv|file.xlsx> [--output <path>] [--yes] [options]

Description:
  Trim cells, remove empty lines, and preview cleaned output by default.

Options:
  --output <path>    Output file path
  --sheet <name>     XLSX sheet name, defaults to the first sheet
  --dry-run          Force preview mode
  --yes              Write the cleaned output file
  --json             Output machine-readable JSON`,
    schema: `ZaoWu Data Schema

Usage:
  zw data schema <file.csv|file.tsv|file.xlsx> [options]

Description:
  Infer a lightweight schema for each column.

Options:
  --sheet <name>     XLSX sheet name, defaults to the first sheet
  --json             Output machine-readable JSON`,
    sample: `ZaoWu Data Sample

Usage:
  zw data sample <file.csv|file.tsv|file.xlsx> [--rows <count>] [options]

Description:
  Show sample rows from supported data files.

Options:
  --rows <count>     Number of rows to return, defaults to 5
  --sheet <name>     XLSX sheet name, defaults to the first sheet
  --json             Output machine-readable JSON`,
    sheets: `ZaoWu Data Sheets

Usage:
  zw data sheets <file.csv|file.tsv|file.xlsx> [options]

Description:
  List available sheets in a spreadsheet workbook.

Options:
  --json             Output machine-readable JSON`,
  },
  dev: {
    status: `ZaoWu Dev Status

Usage:
  zw dev status [options]

Description:
  Show Git branch, staged, unstaged, and untracked files.

Options:
  --json             Output machine-readable JSON`,
    review: `ZaoWu Dev Review

Usage:
  zw dev review [--staged|--worktree] [options]

Description:
  Review staged changes by default, falling back to working-tree changes unless a mode is specified. Output includes diff hunk summaries and risk signals.

Options:
  --staged           Review only staged changes
  --worktree         Review only unstaged working-tree changes
  --ai               Use AI assistance to review changes
  --provider <id>    Specify AI provider (e.g. openai, anthropic, ollama, echo)
  --model <name>     Specify AI model hint
  --json             Output machine-readable JSON`,
    commit: `ZaoWu Dev Commit

Usage:
  zw dev commit [options]

Description:
  Suggest a structured commit message from staged changes and report staged risk findings without modifying Git state.

Options:
  --ai               Use AI assistance to generate the commit message
  --provider <id>    Specify AI provider (e.g. openai, anthropic, ollama, echo)
  --model <name>     Specify AI model hint
  --json             Output machine-readable JSON`,
    sync: `ZaoWu Dev Sync

Usage:
  zw dev sync [--yes] [options]

Description:
  Synchronize and align local branch with its remote tracking branch, fetching updates and hard-resetting.

Options:
  --yes              Execute the synchronization immediately, discarding any local divergence
  --json             Output machine-readable JSON`,
  },
  doc: {
    summary: `ZaoWu Doc Summary

Usage:
  zw doc summary <file> [options]

Description:
  Summarize a supported document.

Options:
  --json             Output machine-readable JSON`,
    extract: `ZaoWu Doc Extract

Usage:
  zw doc extract <file> [options]

Description:
  Extract headings, links, code block counts, and frontmatter.

Options:
  --json             Output machine-readable JSON`,
    convert: `ZaoWu Doc Convert

Usage:
  zw doc convert <file> [--format markdown|text] [--output <path>] [--yes] [options]

Description:
  Convert supported text documents. File writes require --yes.

Options:
  --format <format>  markdown or text
  --output <path>    Output file path
  --dry-run          Force preview mode
  --yes              Write the output file
  --json             Output machine-readable JSON`,
    outline: `ZaoWu Doc Outline

Usage:
  zw doc outline <file> [options]

Description:
  Create an outline from Markdown headings.

Options:
  --json             Output machine-readable JSON`,
    search: `ZaoWu Doc Search

Usage:
  zw doc search <file> <keyword> [options]

Description:
  Search a supported document for a keyword.

Options:
  --json             Output machine-readable JSON`,
  },
  plugin: {
    list: `ZaoWu Plugin List

Usage:
  zw plugin list [options]

Description:
  List locally installed plugin manifests.

Options:
  --json             Output machine-readable JSON`,
    install: `ZaoWu Plugin Install

Usage:
  zw plugin install <id> [--source <path-or-id>] [--yes] [options]

Description:
  Preview or install a local plugin manifest entry.

Options:
  --source <value>   Plugin source id or local directory
  --dry-run          Force preview mode
  --yes              Write the local plugin manifest
  --json             Output machine-readable JSON`,
    remove: `ZaoWu Plugin Remove

Usage:
  zw plugin remove <id> [--yes] [options]

Description:
  Preview or remove a local plugin manifest.

Options:
  --dry-run          Force preview mode
  --yes              Remove the local plugin manifest
  --json             Output machine-readable JSON`,
    validate: `ZaoWu Plugin Validate

Usage:
  zw plugin validate <id-or-path> [options]

Description:
  Validate a plugin id, zaowu.plugin.json, plugin.json, or local source directory.

Options:
  --json             Output machine-readable JSON`,
  },
  teach: {
    plan: `ZaoWu Teach Plan

Usage:
  zw teach plan <topic-or-file> [options]

Description:
  Create a small teaching plan from a topic or readable file.

Options:
  --json             Output machine-readable JSON`,
    quiz: `ZaoWu Teach Quiz

Usage:
  zw teach quiz <topic-or-file> [options]

Description:
  Create practice questions from a topic or readable file.

Options:
  --format <value>   Output format (text or canvas-csv), defaults to text
  --json             Output machine-readable JSON`,
  },
  web: {
    inspect: `ZaoWu Web Inspect

Usage:
  zw web inspect <https-url> [--yes] [options]

Description:
  Preview a target by default. Confirmed use performs a HEAD request.

Options:
  --dry-run          Force preview mode
  --yes              Perform the network request
  --json             Output machine-readable JSON`,
    fetch: `ZaoWu Web Fetch

Usage:
  zw web fetch <https-url> [--yes] [options]

Description:
  Preview a target by default. Confirmed use fetches response text.

Options:
  --dry-run          Force preview mode
  --yes              Perform the network request
  --json             Output machine-readable JSON`,
  },
};
