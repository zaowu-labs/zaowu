# @zaowu-labs/teach

Teaching workflow package for ZaoWu.

This package provides deterministic local teaching-plan and quiz generation for
the first CLI foundation.

Safety:

- It does not call external AI services.
- Future AI-backed teaching behavior should go through `@zaowu-labs/ai`.
- User-facing commands should keep output readable before adding complexity.
