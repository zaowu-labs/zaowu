# @zaowu/cli

Command-line interface for ZaoWu.

This package exposes the `zw` binary and wires domain packages into one product
entry point. It owns command routing, help text, human output, JSON output, and
operation-plan presentation.

Safety:

- Sensitive commands preview by default or require explicit confirmation.
- Expected errors are formatted without raw stack traces.
- JSON output is intended for automation and should stay schema-versioned where
  public contracts are defined.
