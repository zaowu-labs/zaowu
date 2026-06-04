# ZaoWu Architecture

This document defines the long-term structure of ZaoWu. It is meant to keep the
project coherent as new tools are added.

## Product Shape

ZaoWu is one CLI product:

```bash
zw <domain> <action> [target] [options]
```

Root commands are reserved for product lifecycle and diagnostics:

```bash
zw init
zw doctor
zw --help
zw --version
```

Feature commands should live under a domain:

```bash
zw ai ask "Explain this project"
zw dev review
zw dev commit
zw doc summary report.pdf
zw data analyze sales.xlsx
zw auto run workflow.yml
zw plugin install readme-gen
```

Avoid one-off root commands such as `zw pdf-summary`, `zw review-code`, or
`zw aiCommit`.

## Package Boundaries

The repository should grow through modular packages instead of unrelated scripts.

```text
packages/cli       Command parsing, command routing, process I/O
packages/core      Shared errors, error codes, capabilities, domains, and helpers
packages/config    Config discovery, loading, schema validation, path rules
packages/ai        Provider abstraction and model-facing interfaces
packages/dev       Development workflows such as review and commit help
packages/doc       Document workflows such as summary, extract, and convert
packages/data      Data workflows such as inspect, analyze, and clean
packages/auto      Automation workflow validation and execution
packages/web       Web workflows, added only when the CLI foundation is stable
packages/teach     Teaching workflows, added only when the foundation is stable
packages/plugin    Plugin workflows, added after the core product is stable
docs/experience    Product and command experience specs
```

Do not create a package just because a single helper exists. Create a package
when the command domain has a stable boundary and tests can describe its behavior.
The foundation may include empty domain scaffolds so later work has a clear
destination, but those packages should expose planned commands instead of fake
implementations.

## Dependency Direction

Dependencies should point in one direction:

```text
packages/cli
  -> packages/dev, packages/doc, packages/data, packages/auto, packages/plugin
    -> packages/core, packages/config, packages/ai
```

Allowed:

```text
cli -> dev
cli -> doc
dev -> core
dev -> config
dev -> ai
doc -> core
data -> config
```

Avoid:

```text
dev -> cli
doc -> dev
data -> doc
ai -> dev
config -> cli
core -> config
```

When two feature packages need the same helper, move the helper to `core` only if
it is truly generic. If the helper is domain-specific, keep it in the owning
package and do not share it prematurely.

The boundary guard test in `packages/core/src/boundaries.test.ts` prevents domain
packages from importing each other directly. Cross-domain behavior should flow
through `packages/cli` routing or a stable shared abstraction in `core`,
`config`, or `ai`.

## CLI Responsibilities

`packages/cli` should stay thin. It may:

- parse arguments
- choose the command handler
- format final human or JSON output
- set process exit codes
- call feature packages

It should not:

- contain Git review logic
- parse PDFs or spreadsheets
- call model providers directly
- mutate files outside clearly confirmed commands
- hold domain-specific business rules

## Feature Package Responsibilities

Feature packages own domain behavior.

For example, `packages/dev` should own:

- Git repository checks
- diff collection
- review planning
- commit message generation logic

`packages/doc` should own:

- document input validation
- document extraction
- document summary workflows

`packages/data` should own:

- table input validation
- data inspection
- analysis result generation

## AI Boundary

AI behavior should flow through `packages/ai`.

Feature packages should not import a concrete provider directly. They should ask
`packages/ai` for a provider through a stable interface. This keeps future model
changes from leaking into every command.

AI commands must be transparent about:

- what files or text are read
- what request is sent to the provider
- what output is generated
- whether any file or Git state will change

The current OpenAI adapter uses a non-streaming text request through the
Responses API. Feature packages should depend on the provider interface, not on
OpenAI-specific request shapes.

## Config Boundary

`packages/config` owns `zw.yml` discovery and validation.

Config files may describe project behavior, defaults, paths, and provider names.
They must not store secrets such as passwords, API keys, private keys, ID
numbers, recovery codes, or tokens.

Secrets should come from environment variables or a later explicit secret
provider design.

`zw.yml` is versioned. `zw config migrate` owns future config rewrites and should
preview before writing unless `--yes` is provided.

## Safety Boundary

Commands that write files, delete files, modify Git state, run shell commands,
install dependencies, send network requests, or access secrets are sensitive.

Sensitive commands must support at least one of:

- preview
- confirmation
- `--dry-run`

Destructive actions should require confirmation by default.

Domain packages declare a capability ledger in their `DomainDefinition`. Sensitive
CLI handlers should also emit an operation plan that lists:

- files read
- files written
- Git or shell execution
- network targets
- secrets used
- confirmation requirements

This gives users a predictable preflight view before ZaoWu reads, writes, sends,
or executes anything sensitive.

## Command Addition Checklist

Before adding a command:

1. Choose the command shape.
2. Confirm the owning domain.
3. Create or update a spec in `docs/experience/`.
4. Add behavior in the owning package.
5. Wire the command through `packages/cli`.
6. Add tests for happy path, invalid input, important errors, JSON output, and
   dry-run behavior when relevant.
7. Register or update the command contract in `packages/cli/src/command-contracts.ts`.
8. Add or update stable error codes in `packages/core/src/error-codes.ts`.
9. Update README or related docs.
10. Run the full validation suite.

## Current Priority

The project is in the foundation hardening phase. Do not jump to cloud services,
desktop apps, plugin marketplaces, browser automation, or long-running autonomous
agents until the CLI, config, safety model, AI abstraction, and first practical
document/data workflows are stable.
