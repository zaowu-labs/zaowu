import type { DomainDefinition } from '@zaowu-labs/core';
import { DOMAIN_DEFINITIONS } from './domains.js';
import { ACTION_HELP } from './help-text.js';
import { formatRows } from './output.js';

const toTitleCase = (value: string): string => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

export const formatHelp = (): string => {
  const commands = formatRows([
    ['zw init', 'Preview or create a ZaoWu config file'],
    ['zw doctor', 'Check local environment health'],
    ['zw help [domain] [action]', 'Find command help without running a command'],
  ]);
  const domains = formatRows(
    DOMAIN_DEFINITIONS.map((domain) => [`zw ${domain.name}`, domain.summary])
  );

  return `ZaoWu / 造物

Usage:
  zw <command> [options]

Commands:
${commands}

Domains:
${domains}

Common options (support varies by command):
  -h, --help         Show help
  -V, --version      Show version
  --json             Output machine-readable JSON
  --dry-run          Preview without applying changes
  --yes              Confirm an action supported by the command
  --plan-fingerprint <hash>
                     Require confirmed actions to match a previewed plan

Examples:
  zw doctor
  zw doctor --json
  zw init --dry-run
  zw init --yes
  zw dev --help
  zw help data schema

First steps:
  1. Run zw init to preview a project config, then zw init --yes to create it.
  2. Run zw doctor to inspect setup and zw ai providers to choose a provider.
  3. Try zw doc summary <file> or zw data schema <file> for local results.

Safety:
  Sensitive commands preview by default or require confirmation.
  Use --dry-run to keep a confirmed command in preview mode.
  Echo is a local input demonstration; model inference needs a configured provider.

Documentation:
  https://github.com/zaowu-labs/zaowu#quick-start

Support:
  https://github.com/zaowu-labs/zaowu/issues`;
};

export const formatDomainHelp = (domain: DomainDefinition): string => {
  const commands = formatRows(
    domain.commands.map((command) => {
      const flags = [command.status, command.sensitive ? 'sensitive' : undefined]
        .filter(Boolean)
        .join(', ');

      return [`zw ${domain.name} ${command.name}`, `${flags} - ${command.summary}`];
    })
  );
  const capabilities = domain.capabilities
    ? Object.entries(domain.capabilities)
        .filter(([, enabled]) => enabled)
        .map(([name]) => `- ${name}`)
        .join('\n') || '- none'
    : '- none';

  return `ZaoWu ${toTitleCase(domain.name)} Domain

Usage:
  zw ${domain.name} <action> [target] [options]

Description:
  ${domain.summary}

Commands:
${commands}

Capabilities:
${capabilities}

Global options:
  --help             Show help
  --json             Output machine-readable JSON
  --dry-run          Preview without applying changes
  --yes              Apply a safe confirmed action`;
};

export const formatActionHelp = (domain: DomainDefinition, action: string): string =>
  ACTION_HELP[domain.name]?.[action] ??
  `ZaoWu ${toTitleCase(domain.name)} ${toTitleCase(action)}

Usage:
  zw ${domain.name} ${action} [target] [options]

Options:
  --help             Show help
  --json             Output machine-readable JSON`;

export const formatInitHelp = (): string => `ZaoWu Init

Usage:
  zw init [options]

Description:
  Preview or create a starter ZaoWu config file.

Options:
  --dry-run          Preview without writing files
  --yes              Create zw.yml
  --plan-fingerprint <hash>
                     Require confirmed creation to match a preview
  --json             Output machine-readable JSON
  --help             Show this help

Examples:
  zw init
  zw init --dry-run
  zw init --yes
  zw init --yes --plan-fingerprint <hash>
  zw init --json`;

export const formatDoctorHelp = (): string => `ZaoWu Doctor

Usage:
  zw doctor [options]

Description:
  Check local environment health.

Options:
  --json             Output machine-readable JSON
  --help             Show this help

Examples:
  zw doctor
  zw doctor --json`;
