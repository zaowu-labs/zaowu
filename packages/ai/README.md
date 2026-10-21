# @zaowu-labs/ai

AI provider boundary for ZaoWu.

This package defines provider metadata, preview behavior, local echo responses,
and streaming/non-streaming Ollama, OpenAI Responses, and Anthropic adapters used by the CLI.
Feature packages should depend on this boundary instead of calling providers
directly.

Safety:

- Every HTTP-backed provider, including Ollama, previews by default.
- Provider requests require explicit confirmation from the CLI path.
- Operation plans disclose the resolved provider endpoint, including configured base URLs.
- Requests reject HTTP redirects so prompts and credentials cannot be sent to
  another endpoint without a new preview.
- Each request attempt has a bounded timeout covering both response headers
  and JSON/streaming body reads. Failed attempts and timed-out bodies are aborted.
- Secrets must come from environment variables, not config files.
- Provider HTTP failures are classified so authentication, timeout, rate-limit,
  bad-request, and provider-side problems get different fixes.
- Ollama, OpenAI, and Anthropic response shapes are validated before generated
  text is returned; malformed or empty provider output is rejected.
- Provider failure summaries use HTTP status metadata only; response bodies are
  not exposed in user-facing fixes.
- Retryable provider failures can carry retry-delay metadata when providers send
  `Retry-After`.
- Model resolution is shared across preview, operation-plan subjects, and
  confirmed provider requests: explicit `--model` wins, then provider-specific
  environment defaults, then the provider default.

## Streaming and cancellation

`onChunk` opts library callers into streaming; without it requests remain JSON.
Human CLI answers stream by default; `--json` returns one complete envelope.
Pass an `AbortSignal` as `signal` to cancel headers, a body, or retry backoff.
Ctrl+C in the CLI cancels with `AI_REQUEST_CANCELLED` and exit code 130.
The transport makes at most three attempts before body consumption; 429/408/5xx
responses honor a capped Retry-After delay. It never retries incomplete output.

UTF-8 is decoded across byte boundaries. Ollama NDJSON requires `done: true`;
OpenAI SSE requires `response.completed`; Anthropic SSE requires `message_stop`.
Malformed JSON, incomplete stop reasons, empty answers, invalid UTF-8, and EOF
without completion are errors. Metadata, thinking, and tool blocks are not text.
JSON-compatible proxies may return a complete JSON body instead of a stream.

Limits: 200,000 input characters, 30 seconds per attempt including body reads,
8 MiB response bytes, one MiB per stream event, two million output characters.
Use a smaller staged diff or file when a limit is reached. No live model keys are
needed for the local HTTP integration tests.

Anthropic defaults to `claude-sonnet-4-6`, replacing the retired Sonnet 3.5 alias.
Explicit `--model` / `ANTHROPIC_MODEL` still win. Availability is account-specific;
see [Anthropic model lifecycle](https://platform.claude.com/docs/en/about-claude/model-deprecations).
Protocol references: [OpenAI Docs](https://developers.openai.com/api/docs/guides/streaming-responses),
[Anthropic](https://platform.claude.com/docs/en/build-with-claude/streaming),
and [Ollama](https://docs.ollama.com/api/streaming).

Confirmation execution also checks the freshly prepared content against the
already verified plan immediately before the write/request. Changes between
reads fail with `OPERATION_PLAN_MISMATCH` and produce no write or network call.
