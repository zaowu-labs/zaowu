# @zaowu-labs/ai

AI provider boundary for ZaoWu.

This package defines provider metadata, preview behavior, local echo responses,
and non-streaming Ollama, OpenAI, and Anthropic adapters used by the CLI.
Feature packages should depend on this boundary instead of calling providers
directly.

Safety:

- Every HTTP-backed provider, including Ollama, previews by default.
- Provider requests require explicit confirmation from the CLI path.
- Operation plans disclose the resolved provider endpoint, including configured base URLs.
- Requests reject HTTP redirects so prompts and credentials cannot be sent to
  another endpoint without a new preview.
- Each request attempt has a bounded timeout covering both response headers
  and JSON body reads. Failed attempts and timed-out bodies are aborted.
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
