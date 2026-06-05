# @zaowu/ai

AI provider boundary for ZaoWu.

This package defines provider metadata, preview behavior, local echo responses,
and the non-streaming OpenAI adapter used by the CLI. Feature packages should
depend on this boundary instead of calling providers directly.

Safety:

- Network providers preview by default.
- Provider requests require explicit confirmation from the CLI path.
- Secrets must come from environment variables, not config files.
- Provider HTTP failures are classified so retryable and credential-related
  problems get different fixes.
