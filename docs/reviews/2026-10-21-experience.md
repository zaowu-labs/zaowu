# Experience and maintenance review: 2026-10-21

Reviewed baseline: `a2fafdc181ef7c51ee430c227a9854cad2456df9` on the canonical
`zaowu-labs/zaowu` repository. This change preserves the unified local-first AI
toolkit identity and existing command names across all nine domains.

## Reproduced problems and changes

| Problem                                                                           | Result                                                                                                                              |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `zw help data schema` returned unrelated root help                                | Domain/action help parity, `-h` and `-V`, and literal `--` handling                                                                 |
| Assigned boolean flags could authorize work, including `--yes=false`              | Reject with `OPTION_VALUE_INVALID` before dispatch; valid dry-run remains dominant                                                  |
| Fixed-arity commands ignored excess targets                                       | Reject with `ARGUMENT_UNEXPECTED` before reads, Git, writes, or requests; free-text commands remain variadic                        |
| Init checked only `zw.yml`, shadowing other supported configs                     | Check all supported local entries, including directories/dangling links; retain exclusive creation and nested projects              |
| Provider resolution swallowed config errors and ignored global-only preferences   | Shared optional config resolution; visible parse errors; explicit provider override stays first                                     |
| Doctor treated contributor tooling as a CLI prerequisite                          | Keep actual pnpm status and fix, add `required: false`, exclude optional tooling from mandatory readiness/actions                   |
| Corepack diagnostics could download tooling, including through the pnpm shim      | Five-second subprocess bounds; scoped environment disables network, prompts, and auto-pinning on both paths                         |
| Config previews lacked full confirmation commands; POSIX quoting lost apostrophes | Copyable config/migration commands with fingerprints, shell-appropriate literal quoting, and a separator before AI prompt text      |
| README led with broad claims and repository internals                             | Self-contained document/data results, provider distinction, all nine domains, accurate execution limits, published-CLI instructions |

## Changed files and ownership

- CLI input/discovery: `args.ts`, new `input-validation.ts`, `run.ts`,
  `option-validation.ts`, `root-help.ts`, and `help-text.ts`.
- Setup/diagnostics: `root-init.ts`, `root-doctor.ts`, `system-command.ts`, and
  subprocess options in `types.ts`.
- Provider/configuration: `packages/config/src/index.ts`, CLI `handler-utils.ts`,
  AI/configuration handlers. Document/data handlers also preserve literal targets
  in generated confirmation commands.
- Contracts: core error-code registry, shared error schema, doctor schema, error
  and JSON contract docs. Only `required` metadata is added to doctor checks;
  existing envelopes remain version 1.
- Regressions: new `first-run.test.ts` and `confirmation.test.ts`, plus updated
  existing CLI, golden-output, and subprocess tests.
- Product/maintenance: README, Getting Started, first-use/init/doctor/style
  specs, roadmap, `docs/MAINTENANCE.md`, and changelog.
- Root and all 11 public package manifests advance together to `1.0.6`. No
  dependencies, lockfile resolutions, audit exceptions, or CI jobs are removed.

## Verification

The initial 36-case first-use regression suite failed 31 cases on the original
implementation. The final full gate passes **478 functional tests in 24 files**
and **13 release/audit script tests**, including 48 additional functional cases.

```sh
corepack pnpm verify
corepack pnpm audit:prod
git diff --check
```

The complete gate includes build and test typechecking, structure, schemas,
rich PDF/DOCX/XLSX fixtures, JSON contracts, capabilities, smoke, lint, formatting,
release metadata, all 11 compiled archives, and packed CLI installation.

Manual checks ran the actual README file-creation snippets and compiled CLI in
a fresh temporary directory. They checked document headings, numeric table
schema, one-row JSON sampling, help parity, preview/confirmed initialization,
config confirmation containing `O'Reilly`, malformed flag rejection, and an
OpenAI request preview without a model call. An empty Corepack cache verified
that doctor returns optional-tool status without downloading pnpm or creating
`package.json`. Additional compiled-CLI checks confirmed document/data filenames
beginning with `--` and option-like AI file/model values round-trip through copied
commands.

## Limits and next work

The production audit retains the approved, path/version-specific `sprintf-js`
exception expiring on **2026-11-19 UTC**. It is visible and unextended.
Shell workflow execution and plugin-code execution remain blocked. Provider
streaming, richer extraction, Git suggestion quality, and compact human operation
plans have explicit completion criteria in `docs/MAINTENANCE.md`.

The supported six-job CI matrix and post-publish registry/signature/installation
verification remain required before delivery is considered complete.
