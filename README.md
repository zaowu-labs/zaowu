<div align="center">

# 🛠️ ZaoWu / 造物

**One Unified AI-Powered Toolkit for Developers, Automation, Documents, Data, Teaching, and Workflows.**

[![Version](https://img.shields.io/badge/version-1.0.2-blue.svg?style=for-the-badge)](package.json)
[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Node.js%2020.19%2B-orange.svg?style=for-the-badge)](package.json)

---

</div>

## 🌟 Introduction

**ZaoWu / 造物** is a modern, extensible CLI and development suite designed to streamline day-to-day coding, document conversion, data analysis, course design, and workflow automation. It aims to unify diverse developer scripts and utility programs into a cohesive, secure, and predictable ecosystem under a single command entry point: `zw`.

---

## 🛠️ Core Capabilities Matrix

ZaoWu is structured as a monorepo containing specialized domain modules. Here is an overview of what ZaoWu can do out-of-the-box:

| Domain       | Action                                  | Description                                                          | Safety Level                          |
| :----------- | :-------------------------------------- | :------------------------------------------------------------------- | :------------------------------------ |
| **`ai`**     | `providers` / `ask`                     | Use echo, Ollama, OpenAI, or Anthropic behind one provider boundary  | Network preview first                 |
| **`dev`**    | `status` / `review` / `commit` / `sync` | Review changes, suggest commits, and explicitly synchronize branches | Risky sync needs two acknowledgements |
| **`doc`**    | `convert` / `outline` / `search`        | Parse PDF/DOCX into clean Markdown structure; retrieve doc outlines  | Safe (No write without `--yes`)       |
| **`data`**   | `schema` / `sample` / `clean`           | Analyze CSV, TSV, JSON, and XLSX structures                          | Writes preview first                  |
| **`auto`**   | `validate` / `plan` / `run`             | Run messages and bounded structured file writes                      | Shell remains blocked                 |
| **`teach`**  | `plan` / `quiz`                         | Create learning outline tracks and format Canvas quiz exports        | Safe (Read-only)                      |
| **`plugin`** | `validate` / `install`                  | Validate and manage local extension manifests                        | Metadata only                         |
| **`config`** | `get` / `set` / `validate`              | Manage system-wide options, timeouts, and active LLM models          | Safe (Config directory)               |

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js**: `v20.19.0` or newer
- **npm**: included with Node.js

### 2. Installation

Install the public CLI:

```bash
npm install -g @zaowu-labs/cli@1.0.2
zw --version
zw doctor
```

Use `npx --package @zaowu-labs/cli@1.0.2 zw --help` when you want to try ZaoWu without a global install.

### 3. Basic CLI Executions

Everything starts with `zw`. Try these diagnostics to verify your local environment:

```bash
# Run environment diagnostics and check config
zw doctor

# Get command-line help
zw --help
```

---

## 💻 Feature Showcases

### 🤖 Local AI & Code Review

ZaoWu features a provider boundary with explicit network confirmation. Start a
local Ollama daemon and run:

```bash
# Set your active provider to Ollama
zw config set ai.provider ollama --yes

# Perform an AI-assisted code review of your current branch diffs
zw dev review --ai --provider echo
zw dev review --ai --provider ollama --yes
```

### 📄 Document Conversion (DOCX to Markdown)

Extract semantic Markdown documents from DOCX without bloated office dependencies:

```bash
# Convert a document and print the structure
zw doc convert report.docx --format markdown
```

### 📝 Canvas LMS Quiz Export

Generate mock questions from raw study material and export directly to a Canvas-compliant CSV quiz template:

```bash
zw teach quiz "Variables store values. Functions group behavior." --format canvas-csv
```

### ⚙️ Safe Workflow Automation

Run localized workflows defined in simple YAML configs. Message steps and
bounded `writeFile` steps can run after confirmation; shell steps remain
visible but blocked:

```bash
# Preview the execution plan of a workflow
zw auto plan examples/workflows/blocked-shell.yml

# Preview the exact file target of a structured write workflow
zw auto plan examples/workflows/write-file.yml
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

Repository development uses Corepack and pnpm:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm verify
```

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

Security: [SECURITY.md](SECURITY.md) · Support: [SUPPORT.md](SUPPORT.md) · Privacy: [docs/PRIVACY.md](docs/PRIVACY.md) · Commercial direction: [docs/COMMERCIALIZATION.md](docs/COMMERCIALIZATION.md)
