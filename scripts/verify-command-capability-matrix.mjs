/* global console */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const matrixPath = path.join(root, 'docs', 'CAPABILITY_MATRIX.md');
const contractsPath = path.join(root, 'packages', 'cli', 'dist', 'command-contracts.js');

const fail = (message) => {
  throw new Error(message);
};

const commandNameFromContract = (contract) =>
  contract.id === 'root.help' ? 'zw --help' : `zw ${contract.args.join(' ')}`;

const { COMMAND_CONTRACTS } = await import(pathToFileURL(contractsPath).href);
const matrix = await readFile(matrixPath, 'utf8');
const rows = [...matrix.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((match) => match[1].trim());
const rowSet = new Set(rows);
const expected = [
  ...COMMAND_CONTRACTS.map(commandNameFromContract),
  'zw help',
  'zw --version',
  'zw version',
];

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

console.log(`ZaoWu command capability matrix: ok (${expected.length} commands)`);
