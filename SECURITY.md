# Security Policy

## Supported versions

Security fixes are provided for the current npm `latest` release. Upgrade to the latest patch before reporting a problem that may already be fixed.

## Reporting a vulnerability

Do not open a public issue for an unpatched vulnerability. Use GitHub's private vulnerability reporting for `zaowu-labs/zaowu` so maintainers can investigate before disclosure:

<https://github.com/zaowu-labs/zaowu/security/advisories/new>

Include the affected command and version, operating system, minimal reproduction, potential impact, and whether files, secrets, network requests, or Git state are involved. Do not include real credentials or private user data.

## Product security defaults

- Sensitive operations preview or require explicit confirmation.
- Network and AI requests disclose their target before execution.
- Secrets come from environment variables and are not stored in `zw.yml`.
- Production dependencies are audited as part of release preparation.
- Published packages use the `@zaowu-labs` npm scope.
