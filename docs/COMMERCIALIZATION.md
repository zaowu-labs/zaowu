# Commercialization Boundary

ZaoWu follows an open-core product direction without weakening the local CLI.

## Community CLI

The Apache-2.0 CLI remains useful on its own: local workflows, stable JSON contracts, provider choice, preview-first safety, document/data tools, and local plugins.

## Team product direction

Commercial team value should build around shared operational needs rather than paywalling local commands:

- centrally managed policy and provider configuration
- reusable approved workflow and prompt catalogs
- audit events that exclude prompt and file contents by default
- role-based approvals for sensitive operations
- organization usage and cost controls
- supported release channels and response-time commitments

## Enterprise direction

Enterprise work may add SSO, SCIM, private distribution, regional controls, compliance exports, deployment policy, and long-term support.

## Guardrails

- No silent telemetry or content collection.
- No cloud dependency for basic local CLI use.
- No secret storage in ordinary config files.
- Paid layers must integrate through documented contracts rather than forks of command behavior.
- Claims about availability, compliance, or support are made only after the capability exists operationally.
