<div align="center">

# 🛠️ ZaoWu / 造物

**One Unified AI-Powered Toolkit for Developers, Automation, Documents, Data, Teaching, and Workflows.**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg?style=for-the-badge)](package.json)
[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Node.js%2020.19%2B-orange.svg?style=for-the-badge)](package.json)

---

</div>

## 🌟 Introduction

**ZaoWu / 造物** is a modern, extensible CLI and development suite designed to streamline day-to-day coding, document conversion, data analysis, course design, and workflow automation. It aims to unify diverse developer scripts and utility programs into a cohesive, secure, and predictable ecosystem under a single command entry point: `zw`.

---

## 🛠️ Core Capabilities Matrix

ZaoWu is structured as a monorepo containing specialized domain modules. Here is an overview of what ZaoWu can do out-of-the-box:

| Domain       | Action                                  | Description                                                             | Safety Level                    |
| :----------- | :-------------------------------------- | :---------------------------------------------------------------------- | :------------------------------ |
| **`ai`**     | `providers` / `ask`                     | List local LLM providers (Ollama, OpenAI) and prompt models             | Safe (Read-only)                |
| **`dev`**    | `status` / `review` / `commit` / `sync` | Run smart code reviews, commit suggestions, and branch synchronizations | Safe (Preview first)            |
| **`doc`**    | `convert` / `outline` / `search`        | Parse PDF/DOCX into clean Markdown structure; retrieve doc outlines     | Safe (No write without `--yes`) |
| **`data`**   | `schema` / `sample` / `clean`           | Analyze XLSX/CSV structures and return tabular column definitions       | Safe (Read-only)                |
| **`auto`**   | `validate` / `plan` / `run`             | Execute versioned automation workflows (supports message & shell steps) | Sensitive (Needs `--yes`)       |
| **`teach`**  | `plan` / `quiz`                         | Create learning outline tracks and format Canvas quiz exports           | Safe (Read-only)                |
| **`plugin`** | `validate` / `install`                  | Validate local extension manifests and install workspace plugins        | Safe (Local-first)              |
| **`config`** | `get` / `set` / `validate`              | Manage system-wide options, timeouts, and active LLM models             | Safe (Config directory)         |

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js**: `v20.19.0` or newer
- **pnpm**: `v10.34.1` or newer (Corepack-managed)

### 2. Installation

Initialize the workspace and compile all packages:

```bash
# Enable corepack and install dependencies
corepack enable
corepack pnpm install

# Build all packages and run checks
corepack pnpm verify
```

### 3. Basic CLI Executions

Everything starts with `zw`. Try these diagnostics to verify your local environment:

```bash
# Run environment diagnostics and check config
corepack pnpm zw doctor

# Get command-line help
corepack pnpm zw --help
```

---

## 💻 Feature Showcases

### 🤖 Local AI & Code Review

ZaoWu features a local-first architecture. Start a local Ollama daemon and run:

```bash
# Set your active provider to Ollama
corepack pnpm zw config set ai.provider ollama

# Perform an AI-assisted code review of your current branch diffs
corepack pnpm zw dev review --ai
```

### 📄 Document Conversion (DOCX to Markdown)

Extract semantic Markdown documents from DOCX without bloated office dependencies:

```bash
# Convert a document and print the structure
corepack pnpm zw doc convert report.docx --format markdown
```

### 📝 Canvas LMS Quiz Export

Generate mock questions from raw study material and export directly to a Canvas-compliant CSV quiz template:

```bash
corepack pnpm zw teach quiz "Variables store values. Functions group behavior." --format canvas-csv
```

### ⚙️ Safe Workflow Automation

Run localized dev-ops pipelines defined in simple YAML configs. Shell steps default to a safe dry-run preview:

```bash
# Preview the execution plan of a workflow
corepack pnpm zw auto plan examples/workflows/blocked-shell.yml

# Execute the workflow commands after verifying safety
corepack pnpm zw auto run examples/workflows/blocked-shell.yml --yes
```

---

## 📁 Repository Structure

The project code is divided into modular domain packages using pnpm workspaces:

```text
├── packages/
│   ├── cli/         # The global 'zw' CLI dispatcher and terminal formatter
│   ├── core/        # Shared errors, domain ledgers, capabilities, and matrix rules
│   ├── config/      # Config loading and validation (zw.yml / zaowu.config.json)
│   ├── ai/          # Provider adapters (OpenAI, Ollama) and timeout guards
│   ├── dev/         # Git parsing, diff chunk extraction, and review builders
│   ├── doc/         # DOCX/PDF text parsers and Mammoth markdown converter
│   ├── data/        # CSV/XLSX parser and metadata analyzer
│   ├── auto/        # Workflow parser, security sandboxing, and script executor
│   ├── teach/       # LMS quiz exporter and curriculum planner
│   └── plugin/      # Local manifest validator and extension registry
├── examples/        # Safe inputs (YAML, Markdown, CSV) for CLI validation
└── schemas/         # Versioned JSON Schemas for configuration and commands
```

---

## 🧑‍💻 Developer Contribution

### Adding a New Command

1. Define the action capabilities in your domain's ledger (e.g. `packages/dev/src/index.ts`).
2. Add command schemas under `schemas/zaowu.command.<domain>-<action>.schema.json`.
3. Add the command contract checks inside `scripts/verify-command-capability-matrix.mjs`.
4. Run validation check:
   ```bash
   corepack pnpm verify
   ```

---

<div align="center">

Made with ❤️ by ZaoWu Labs.

</div>
