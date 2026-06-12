# @zaowu/ai

AI provider boundary for ZaoWu.

This package defines provider metadata, preview behavior, local echo responses,
and the non-streaming OpenAI adapter used by the CLI. Feature packages should
depend on this boundary instead of calling providers directly.

Safety:

- Network providers preview by default.
- Provider requests require explicit confirmation from the CLI path.
- Secrets must come from environment variables, not config files.
- Provider HTTP failures are classified so authentication, timeout, rate-limit,
  bad-request, and provider-side problems get different fixes.
- Provider failure summaries use HTTP status metadata only; response bodies are
  not exposed in user-facing fixes.
- Retryable provider failures can carry retry-delay metadata when providers send
  `Retry-After`.
- Model resolution is shared across preview, operation-plan subjects, and
  confirmed provider requests: explicit `--model` wins, then `OPENAI_MODEL`,
  then the provider default.
