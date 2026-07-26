/* global console */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const matrixPath = path.join(root, 'docs', 'CAPABILITY_MATRIX.md');
const contractsPath = path.join(root, 'packages', 'cli', 'dist', 'command-contracts.js');
const domainsPath = path.join(root, 'packages', 'cli', 'dist', 'domains.js');

const fail = (message) => {
  throw new Error(message);
};

const commandNameFromContract = (contract) =>
  contract.id === 'root.help' ? 'zw --help' : `zw ${contract.args.join(' ')}`;

const { COMMAND_CONTRACTS, ADDITIONAL_ROOT_SURFACES } = await import(
  pathToFileURL(contractsPath).href
);
const { DOMAIN_DEFINITIONS } = await import(pathToFileURL(domainsPath).href);
const matrix = await readFile(matrixPath, 'utf8');

// Parse every table row into its full column set so the safety columns are
// verified, not just the command names.
const COLUMN_NAMES = ['command', 'reads', 'writes', 'git', 'shell', 'network', 'secrets', 'safety'];

const parsedRows = matrix
  .split(/\r?\n/)
  .filter((line) => /^\|\s*`[^`]+`\s*\|/.test(line))
  .map((line) => {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells.length !== COLUMN_NAMES.length) {
      fail(
        `Capability matrix row has ${cells.length} columns, expected ${COLUMN_NAMES.length}: ${line}`
      );
    }

    const row = Object.fromEntries(COLUMN_NAMES.map((name, index) => [name, cells[index]]));
    row.command = row.command.replaceAll('`', '');

    return row;
  });

const rows = parsedRows.map((row) => row.command);
const rowSet = new Set(rows);
const rowByCommand = new Map(parsedRows.map((row) => [row.command, row]));
const expected = [...COMMAND_CONTRACTS.map(commandNameFromContract), ...ADDITIONAL_ROOT_SURFACES];

for (const command of expected) {
  if (!rowSet.has(command)) {
    fail(`Capability matrix is missing \`${command}\`.`);
  }
}

for (const command of rows) {
  if (!expected.includes(command)) {
    fail(`Capability matrix documents unknown command \`${command}\`.`);
  }
}

for (const command of rows) {
  const count = rows.filter((candidate) => candidate === command).length;

  if (count > 1) {
    fail(`Capability matrix documents \`${command}\` ${count} times.`);
  }
}

// --- Column-level checks -----------------------------------------------------

// Phrases that mean "this capability is not exercised".
const isNone = (cell) => cell === 'none';
const isNoneOrBlocked = (cell) => cell === 'none' || cell === 'blocked';
// Secrets wording that documents refusal or absence rather than access.
const isNoSecretAccess = (cell) => ['none', 'no secret values', 'rejects secrets'].includes(cell);

// 1. A domain whose capability ledger disclaims a capability must not have a
//    matrix row claiming that capability, and a ledger that claims one must be
//    backed by at least one command row exercising it.
const LEDGER_COLUMN_RULES = [
  { ledgerKey: 'readsFiles', column: 'reads', allowed: isNone, label: 'file reads' },
  { ledgerKey: 'writesFiles', column: 'writes', allowed: isNone, label: 'file writes' },
  {
    ledgerKey: 'modifiesGit',
    column: 'git',
    allowed: (cell) => isNone(cell) || cell === 'read-only',
    label: 'Git state',
  },
  { ledgerKey: 'executesShell', column: 'shell', allowed: isNoneOrBlocked, label: 'shell execution' },
  { ledgerKey: 'usesNetwork', column: 'network', allowed: isNoneOrBlocked, label: 'network' },
  { ledgerKey: 'accessesSecrets', column: 'secrets', allowed: isNoSecretAccess, label: 'secrets' },
];

for (const domain of DOMAIN_DEFINITIONS) {
  const domainRows = parsedRows.filter((row) => row.command.startsWith(`zw ${domain.name} `));

  if (domainRows.length === 0) {
    continue;
  }

  for (const rule of LEDGER_COLUMN_RULES) {
    const ledgerClaims = domain.capabilities[rule.ledgerKey];

    for (const row of domainRows) {
      if (!ledgerClaims && !rule.allowed(row[rule.column])) {
        fail(
          `\`${row.command}\` documents ${rule.label} \`${row[rule.column]}\`, but the ` +
            `\`${domain.name}\` domain ledger declares ${rule.ledgerKey}: false. ` +
            'Fix the ledger or the matrix so they agree.'
        );
      }
    }

    if (ledgerClaims && domainRows.every((row) => rule.allowed(row[rule.column]))) {
      fail(
        `The \`${domain.name}\` domain ledger declares ${rule.ledgerKey}: true, but no ` +
          `matrix row for the domain documents ${rule.label}. Fix the ledger or the matrix.`
      );
    }
  }
}

// 2. Every sensitive command must document a preview/confirmation safety mode.
for (const contract of COMMAND_CONTRACTS) {
  if (!contract.sensitive) {
    continue;
  }

  const row = rowByCommand.get(commandNameFromContract(contract));

  if (!row) {
    continue; // Missing rows already failed above.
  }

  if (!/preview|acknowledgement/i.test(row.safety)) {
    fail(
      `\`${row.command}\` is a sensitive command, but its safety mode ` +
        `\`${row.safety}\` does not document a preview or acknowledgement step.`
    );
  }
}

console.log(
  `ZaoWu command capability matrix: ok (${expected.length} commands, safety columns verified)`
);
