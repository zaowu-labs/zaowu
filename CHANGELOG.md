# ZaoWu Changelog

## Unreleased

- Foundation hardening is in progress.
- Added versioned JSON contracts for `zw ai ask`, `zw ai providers`,
  `zw dev commit`, and `zw dev status`.
- Hardened document/data/AI/automation boundary coverage and release-readiness
  checks.
- Hardened web request failures and bounded fetch response reporting.
- Added default timeouts for confirmed web requests and response body reads.
- Restored the foundation safety boundary that keeps all automation shell steps blocked.
- Classified Ollama as an HTTP-backed provider that requires preview and confirmation.
- Restored the non-streaming OpenAI Responses API adapter and disclosed resolved AI endpoints.
- Hardened YAML config serialization and bound config confirmation fingerprints to values.
- Expanded `zw dev sync` operation plans to disclose fetch, hard reset, and origin access.
- Disabled automatic web redirects so confirmed requests stay on the disclosed target.
- Fixed numeric analysis so partially numeric text is not treated as a number.
- No public npm package has been released yet.
