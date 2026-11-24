# @zaowu-labs/core

Core shared package for ZaoWu.

This package contains stable cross-domain primitives: user-facing errors, error
codes, domain definitions, capability ledgers, operation plans, and small text
helpers.

In an ES module, import `createOperationPlan` from `@zaowu-labs/core` to
construct a plan with a stable fingerprint. For terminal commands such as
`zw doctor`, install the [ZaoWu CLI](https://www.npmjs.com/package/@zaowu-labs/cli).

Operation-plan helpers also include generated-content fingerprints. Commands
that preview file writes can use `content-sha256` and `content-length` subjects
so `--plan-fingerprint` confirmation is bound to the content as well as the
target path.

`prepareExclusiveOutputPath` resolves the parent of a new file and checks
that the destination is writable and unoccupied. Callers can include the
returned physical path in a preview and pass it to an exclusive write.

`decodeTextBytes` strictly decodes UTF-8 or BOM-marked UTF-16 in either byte
order and rejects embedded NULs. The caller supplies the domain error and can
use `preserveBom` to keep the leading encoding mark.

Boundary:

- Domain packages may depend on core.
- Core must not depend on feature packages or the CLI.
- Shared helpers should stay generic and product-level.
