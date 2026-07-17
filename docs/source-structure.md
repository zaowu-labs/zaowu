# Source structure

ZaoWu keeps public package entry points stable while moving cohesive responsibilities into focused modules.

## Module boundaries

- `index.ts` is the public entry point and orchestration layer. It may re-export stable public contracts.
- `contracts.ts` owns public request, response, provider, workflow, and result types.
- `domain.ts` owns command metadata and capability declarations.
- Policy and execution logic belong in named modules such as `shell-safety.ts` or `sync.ts`.
- CLI root dispatch, help rendering, option validation, diagnostics, initialization, and system command execution remain separate concerns.

Do not split files by arbitrary line ranges. Extract a module only when it has a clear responsibility, a small dependency surface, and tests that can preserve existing behavior.

## Size guard

Production TypeScript files under `packages/*/src` must not exceed 1,000 lines. Tests and declaration files are excluded. The limit is a backstop rather than a design target: new modules should normally be much smaller.

Run `pnpm verify:structure` locally. The full `pnpm verify` pipeline runs the same check.
