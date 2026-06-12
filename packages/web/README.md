# @zaowu/web

Web workflow package for ZaoWu.

This package previews or performs explicit web requests for URL inspection and
fetching.

Safety:

- Network requests preview by default.
- Confirmed requests require `--yes` through the CLI path.
- Output should make the target URL and request status clear.
- Confirmed requests use a bounded default timeout.
- Request failures use structured ZaoWu errors instead of raw network errors.
- Fetched response bodies are bounded and report whether truncation happened.
