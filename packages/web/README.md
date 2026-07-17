# @zaowu-labs/web

Web workflow package for ZaoWu.

This package previews or performs explicit web requests for URL inspection and
fetching.

Safety:

- Network requests preview by default.
- Confirmed requests require `--yes` through the CLI path.
- Output should make the target URL and request status clear.
- Confirmed requests use a bounded default timeout.
- Redirects are not followed automatically, so the confirmed network target stays the disclosed URL.
- Request failures use structured ZaoWu errors instead of raw network errors.
- Fetched response previews are bounded to 4,000 characters by default.
- Native streaming responses stop after 1 MiB by default instead of buffering an
  unbounded response; results report bytes read and whether the body length is exact.
