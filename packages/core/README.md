# @zaowu/core

Core shared package for ZaoWu.

This package contains stable cross-domain primitives: user-facing errors, error
codes, domain definitions, capability ledgers, operation plans, and small text
helpers.

Boundary:

- Domain packages may depend on core.
- Core must not depend on feature packages or the CLI.
- Shared helpers should stay generic and product-level.
