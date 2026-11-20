# Product experience spec for `zw ai ask --raw`

Developers can pass a complete AI answer to another program as plain UTF-8
text. `zw ai ask "Explain ZaoWu" --provider echo --raw` returns the local Echo
answer alone. `--stdin` works with the same output mode.

- `--raw` accepts the existing input sources and output path option. Users
  choose between `--raw` and `--json`.
- The command buffers the answer through completion and any requested save.
  Successful nonterminal stdout contains the answer exactly, including its line
  breaks. An interactive terminal escapes control characters as usual.
- Provider and file-write previews remain in effect. In raw mode the preview
  and its confirmation command go to stderr, leaving stdout empty. This also
  applies when `--dry-run` overrides `--yes`. Preview retains its normal success
  exit status. Errors use the existing nonzero exit codes and stderr.
- The preview confirmation command retains `--raw`. The fingerprint continues
  to bind the provider, model, input, endpoint, and any answer destination.

Acceptance covers exact stdout, repeatable confirmation, empty stdout for
previews or incomplete answers, terminal escaping, and the option conflict.
