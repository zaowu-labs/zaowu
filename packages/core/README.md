# @zaowu/core

Core shared package for ZaoWu.

This package contains stable cross-domain primitives: user-facing errors, error
codes, domain definitions, capability ledgers, operation plans, and small text
helpers.

Operation-plan helpers also include generated-content fingerprints. Commands
that preview file writes can use `content-sha256` and `content-length` subjects
so `--plan-fingerprint` confirmation is bound to the content as well as the
target path.

Boundary:

- Domain packages may depend on core.
- Core must not depend on feature packages or the CLI.
- Shared helpers should stay generic and product-level.
