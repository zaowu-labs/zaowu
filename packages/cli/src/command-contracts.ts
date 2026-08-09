import { findDomainCommand } from '@zaowu-labs/core';
import { findDomain } from './domains.js';

export interface CommandContract {
  id: string;
  args: readonly string[];
  helpArgs: readonly string[];
  helpIncludes: readonly string[];
  json: boolean;
  sensitive: boolean;
  schemaFile?: string;
}

const commandSchemaFile = (id: string): string =>
  `schemas/zaowu.command.${id.replace('.', '-')}.schema.json`;

const isDomainCommandSensitive = (domainName: string, action: string): boolean => {
  const domain = findDomain(domainName);
  const command = domain ? findDomainCommand(domain, action) : undefined;

  if (!command) {
    throw new Error(
      `Command contract references unknown command: ${domainName} ${action}. ` +
        'Declare it in the domain package before adding a contract.'
    );
  }

  return Boolean(command.sensitive);
};

/**
 * Root command surfaces tracked in docs/CAPABILITY_MATRIX.md that are not
 * COMMAND_CONTRACTS entries (aliases of `--help`/`--version`). The capability
 * matrix check and `zw doctor` both derive their counts from this list so the
 * two can never drift apart.
 */
export const ADDITIONAL_ROOT_SURFACES = ['zw help', 'zw --version', 'zw version'] as const;

export const COMMAND_CONTRACTS: readonly CommandContract[] = [
  {
    id: 'root.help',
    args: ['--help'],
    helpArgs: ['--help'],
    helpIncludes: ['ZaoWu / 造物', 'zw doctor'],
    json: true,
    sensitive: false,
  },
  {
    id: 'init',
    args: ['init'],
    helpArgs: ['init', '--help'],
    helpIncludes: ['ZaoWu Init', 'zw init --yes', '--plan-fingerprint <hash>'],
    json: true,
    sensitive: true,
    schemaFile: commandSchemaFile('init'),
  },
  {
    id: 'doctor',
    args: ['doctor'],
    helpArgs: ['doctor', '--help'],
    helpIncludes: ['ZaoWu Doctor', 'zw doctor --json'],
    json: true,
    sensitive: false,
    schemaFile: commandSchemaFile('doctor'),
  },
  ...[
    ['ai', 'ask', 'ZaoWu AI Ask'],
    ['ai', 'providers', 'ZaoWu AI Providers'],
    ['auto', 'validate', 'ZaoWu Auto Validate'],
    ['auto', 'plan', 'ZaoWu Auto Plan'],
    ['auto', 'run', 'ZaoWu Auto Run'],
    ['config', 'show', 'ZaoWu Config Show'],
    ['config', 'path', 'ZaoWu Config Path'],
    ['config', 'validate', 'ZaoWu Config Validate'],
    ['config', 'get', 'ZaoWu Config Get'],
    ['config', 'set', 'ZaoWu Config Set'],
    ['config', 'migrate', 'ZaoWu Config Migrate'],
    ['data', 'inspect', 'ZaoWu Data Inspect'],
    ['data', 'analyze', 'ZaoWu Data Analyze'],
    ['data', 'clean', 'ZaoWu Data Clean'],
    ['data', 'schema', 'ZaoWu Data Schema'],
    ['data', 'sample', 'ZaoWu Data Sample'],
    ['data', 'sheets', 'ZaoWu Data Sheets'],
    ['dev', 'status', 'ZaoWu Dev Status'],
    ['dev', 'review', 'ZaoWu Dev Review'],
    ['dev', 'commit', 'ZaoWu Dev Commit'],
    ['dev', 'sync', 'ZaoWu Dev Sync'],
    ['doc', 'summary', 'ZaoWu Doc Summary'],
    ['doc', 'extract', 'ZaoWu Doc Extract'],
    ['doc', 'convert', 'ZaoWu Doc Convert'],
    ['doc', 'outline', 'ZaoWu Doc Outline'],
    ['doc', 'search', 'ZaoWu Doc Search'],
    ['plugin', 'list', 'ZaoWu Plugin List'],
    ['plugin', 'install', 'ZaoWu Plugin Install'],
    ['plugin', 'remove', 'ZaoWu Plugin Remove'],
    ['plugin', 'validate', 'ZaoWu Plugin Validate'],
    ['teach', 'plan', 'ZaoWu Teach Plan'],
    ['teach', 'quiz', 'ZaoWu Teach Quiz'],
    ['web', 'inspect', 'ZaoWu Web Inspect'],
    ['web', 'fetch', 'ZaoWu Web Fetch'],
  ].map(([domain, action, title]) => ({
    id: `${domain}.${action}`,
    args: [domain, action],
    helpArgs: [domain, action, '--help'],
    helpIncludes: [title, `zw ${domain} ${action}`],
    json: true,
    // Sensitivity has exactly one source of truth: the domain package's own
    // command declaration. Deriving it here removes the drift risk of two
    // independent boolean tables.
    sensitive: isDomainCommandSensitive(domain, action),
    schemaFile: commandSchemaFile(`${domain}.${action}`),
  })),
];
