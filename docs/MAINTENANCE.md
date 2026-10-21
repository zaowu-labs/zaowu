# ZaoWu Maintenance Priorities

ZaoWu is one local-first AI toolkit for developers, technical creators, and small
teams. Keep command grammar, configuration, errors, safety disclosures, and JSON
contracts consistent across its nine domains.

## Current baseline

- All 11 public packages release together from the canonical repository.
- Six CI jobs cover Ubuntu, Windows, and macOS on Node 20.19 and Node 24.
- Release checks build and inspect the actual compiled tarballs and install the
  packed CLI. Public packages use protected npm Trusted Publishing and provenance.
- Local document/data processing, model requests, Git previews, workflow planning,
  template teaching drafts, HTTP previews, and local manifest management exist.
- Workflow shell execution and plugin-code execution remain outside this release.

## Current improvement: first use and recovery

Experience contract: [First use](experience/ZW_FIRST_RUN.md).

Acceptance evidence belongs in the pull request and release notes:

- A fresh user obtains document and table results from self-contained README
  examples, then chooses a real model explicitly.
- Help can be discovered with `zw help <domain> <action>` and `-h` without
  executing the requested operation.
- Malformed boolean flags and extra targets fail before side effects.
- Initialization preserves every supported local config name; invalid preferences
  do not silently change providers.
- Configuration previews provide commands bound to the displayed plan. Shell
  quoting preserves literal values and option-like prompts.
- Doctor distinguishes optional repository tooling from CLI prerequisites.

## Next priorities

| Priority | Work                                                                                    | Completion evidence                                                                                                          |
| -------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| P0       | Resolve or replace the approved `sprintf-js` dependency exception before 2026-11-19 UTC | Production audit passes without the exception; no expiry extension or broader bypass                                         |
| P1       | Deepen real provider reliability                                                        | Focused fake-server cases for streaming cancellation, retries, timeouts, and malformed events; usable provider setup errors  |
| P1       | Improve document/data results with real inputs                                          | PDF/DOCX/XLSX fixtures cover extraction limitations, large inputs, missing values, and actionable errors                     |
| P1       | Improve Git review and commit quality                                                   | Representative repositories demonstrate useful findings/suggestions with clear heuristic/AI labeling and unchanged Git state |
| P2       | Make operation plans easier to scan                                                     | A proposed compact human view preserves every sensitive target and leaves JSON contracts unchanged                           |
| P2       | Compose domains around repeated jobs                                                    | An experience spec defines inputs, outputs, approval boundaries, and ownership before implementation                         |

Prioritize reproduced user failures over adding domains. Keep the broader
[roadmap](ROADMAP.md) as direction; the table above defines near-term order.

## Delivery loop

1. Record the user problem and observable success criteria in the experience spec.
2. Add a regression that reproduces a behavioral defect before changing code.
3. Implement in the owning package; compose cross-domain work in the CLI.
4. Update action help, README/guide examples, schemas, and changelog as needed.
5. Run `corepack pnpm verify`, `corepack pnpm audit:prod`, and manual first-use
   examples. Inspect the diff and the exact artifacts that will be published.
6. Use a pull request; wait for all six CI jobs before merging. Release from a
   green `main`, keep tags immutable, and verify registry versions, signatures,
   source/integrity bindings, and installed commands after publishing.

Bug and feature issue forms, the PR template, weekly dependency updates, and
existing release protections are already in place. Use these workflows and keep
maintenance decisions tied to user-visible results.
