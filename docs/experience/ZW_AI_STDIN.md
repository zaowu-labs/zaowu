# Product Experience Spec for `zw ai ask --stdin`

## Summary and target user

Developers and technical creators can ask a model about the text produced by a
command or redirected from a file. They can keep a prompt in the command line
and pass the input data through the shell pipeline. Piped input is an established
workflow in [Claude Code](https://code.claude.com/docs/en/headless#pipe-data-through-claude),
[Gemini CLI](https://google-gemini.github.io/gemini-cli/docs/cli/headless.html),
and [LLM](https://llm.datasette.io/en/stable/usage.html).

## Core job and golden path

Send relevant text from an existing tool into `zw ai ask` in one command. A
local Echo example works without model credentials.

```bash
zw doc extract examples/docs/report.md --json | zw ai ask "List action items" --stdin --provider echo --json
```

The result has `status: "ok"`, `input.source: "prompt+stdin"`, and the number of
input characters. With a network provider, the same command previews input and
endpoint first. Recreate the pipe with the same text and use the displayed
confirmation command to send the request.

## Command and input rules

- `zw ai ask [prompt] --stdin [options]` reads a pipe or redirected input until
  EOF. A terminal with no redirected input produces an actionable error.
- The user must select `--stdin` to read the stream. `--file` and `--stdin` are
  alternative context sources. Empty or whitespace-only streams fail, even
  when the command includes a prompt.
- Content is UTF-8 text. Invalid UTF-8, NUL bytes, and inputs larger than the
  existing combined 200,000-character limit fail before contacting a provider.
- A prompt is optional. Provided text is labeled as standard input in the
  model request, with its line breaks and whitespace preserved.

## Output and safety rules

- Human previews identify standard input, report its size, and show a
  confirmation command with instructions to supply the same input again.
- JSON keeps schema version 1 and adds `stdin` and `prompt+stdin` source values
  and `input.stdinCharacters` for those values. Preview output shows the input
  metadata and fingerprint.
- Reading and validating the stream precede sending or saving. The operation
  plan names standard input and binds content to the fingerprint. Supplying a
  fingerprint with changed input fails. `--dry-run` takes precedence over `--yes`
  for network requests and file output. Echo still works locally.
- Ctrl+C during input reading uses the same cancellation error and exit code as
  cancelled generation. The input stays in memory for the current invocation.

## Errors and acceptance

Cover a real pipe, redirected input, prompt-only compatibility, UTF-8 characters
split between reads, empty and malformed input, conflicting sources, size limits,
read errors, cancellation, JSON, dry-run, and confirmation with changed input.
Verify that no request is sent or file is written on a failed check. Update
action help, examples, the operation matrix, the schemas, and the changelog.
