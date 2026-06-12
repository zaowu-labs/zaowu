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
    helpIncludes: ['ZaoWu Init', 'zw init --yes'],
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
    ['ai', 'ask', 'ZaoWu AI Ask', true],
    ['ai', 'providers', 'ZaoWu AI Providers', false],
    ['auto', 'validate', 'ZaoWu Auto Validate', false],
    ['auto', 'plan', 'ZaoWu Auto Plan', false],
    ['auto', 'run', 'ZaoWu Auto Run', true],
    ['config', 'show', 'ZaoWu Config Show', false],
    ['config', 'path', 'ZaoWu Config Path', false],
    ['config', 'validate', 'ZaoWu Config Validate', false],
    ['config', 'get', 'ZaoWu Config Get', false],
    ['config', 'set', 'ZaoWu Config Set', true],
    ['config', 'migrate', 'ZaoWu Config Migrate', true],
    ['data', 'inspect', 'ZaoWu Data Inspect', false],
    ['data', 'analyze', 'ZaoWu Data Analyze', false],
    ['data', 'clean', 'ZaoWu Data Clean', true],
    ['data', 'schema', 'ZaoWu Data Schema', false],
    ['data', 'sample', 'ZaoWu Data Sample', false],
    ['data', 'sheets', 'ZaoWu Data Sheets', false],
    ['dev', 'status', 'ZaoWu Dev Status', false],
    ['dev', 'review', 'ZaoWu Dev Review', false],
    ['dev', 'commit', 'ZaoWu Dev Commit', true],
    ['dev', 'sync', 'ZaoWu Dev Sync', true],
    ['doc', 'summary', 'ZaoWu Doc Summary', false],
    ['doc', 'extract', 'ZaoWu Doc Extract', false],
    ['doc', 'convert', 'ZaoWu Doc Convert', true],
    ['doc', 'outline', 'ZaoWu Doc Outline', false],
    ['doc', 'search', 'ZaoWu Doc Search', false],
    ['plugin', 'list', 'ZaoWu Plugin List', false],
    ['plugin', 'install', 'ZaoWu Plugin Install', true],
    ['plugin', 'remove', 'ZaoWu Plugin Remove', true],
    ['plugin', 'validate', 'ZaoWu Plugin Validate', false],
    ['teach', 'plan', 'ZaoWu Teach Plan', false],
    ['teach', 'quiz', 'ZaoWu Teach Quiz', false],
    ['web', 'inspect', 'ZaoWu Web Inspect', true],
    ['web', 'fetch', 'ZaoWu Web Fetch', true],
  ].map(([domain, action, title, sensitive]) => ({
    id: `${domain}.${action}`,
    args: [domain as string, action as string],
    helpArgs: [domain as string, action as string, '--help'],
    helpIncludes: [title as string, `zw ${domain} ${action}`],
    json: true,
    sensitive: sensitive as boolean,
    schemaFile: commandSchemaFile(`${domain}.${action}`),
  })),
];
