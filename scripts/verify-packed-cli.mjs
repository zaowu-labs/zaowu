/* global console, process */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(path.join(tmpdir(), 'zaowu-pack-install-'));
const appDir = path.join(scratch, 'app');
const tarballDir = path.join(appDir, 'tarballs');
const packageNamesByTarballPrefix = new Map([
  ['zaowu-ai-', '@zaowu/ai'],
  ['zaowu-auto-', '@zaowu/auto'],
  ['zaowu-cli-', '@zaowu/cli'],
  ['zaowu-config-', '@zaowu/config'],
  ['zaowu-core-', '@zaowu/core'],
  ['zaowu-data-', '@zaowu/data'],
  ['zaowu-dev-', '@zaowu/dev'],
  ['zaowu-doc-', '@zaowu/doc'],
  ['zaowu-plugin-', '@zaowu/plugin'],
  ['zaowu-teach-', '@zaowu/teach'],
  ['zaowu-web-', '@zaowu/web'],
]);

const getCorepackCommand = (args) =>
  process.platform === 'win32'
    ? { command: 'cmd.exe', args: ['/d', '/s', '/c', 'corepack', ...args] }
    : { command: 'corepack', args };

const run = (args, options = {}) => {
  const corepack = getCorepackCommand(args);

  return execFileSync(corepack.command, corepack.args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

try {
  mkdirSync(appDir, { recursive: true });
  mkdirSync(tarballDir, { recursive: true });

  run(['pnpm', '--filter', './packages/*', 'pack', '--pack-destination', tarballDir]);

  const tarballs = readdirSync(tarballDir)
    .filter((name) => name.endsWith('.tgz'))
    .map((name) => path.join(tarballDir, name))
    .sort();

  assert(
    tarballs.some((filePath) => path.basename(filePath).startsWith('zaowu-cli-')),
    'CLI tarball should be present.'
  );
  assert(
    tarballs.length === packageNamesByTarballPrefix.size,
    'All workspace package tarballs should be present.'
  );

  const dependencies = Object.fromEntries(
    tarballs.map((filePath) => {
      const tarballName = path.basename(filePath);
      const packageName = [...packageNamesByTarballPrefix.entries()].find(([prefix]) =>
        tarballName.startsWith(prefix)
      )?.[1];

      assert(packageName, `Unknown ZaoWu tarball name: ${tarballName}`);

      return [packageName, `file:tarballs/${tarballName}`];
    })
  );

  writeFileSync(
    path.join(appDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'zaowu-packed-cli-smoke',
        private: true,
        packageManager: 'pnpm@10.34.1',
        dependencies,
        pnpm: {
          overrides: dependencies,
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  run(['pnpm', 'install'], { cwd: appDir });

  const version = JSON.parse(run(['pnpm', 'exec', 'zw', '--version', '--json'], { cwd: appDir, capture: true }));
  assert(version.status === 'ok', 'Packed CLI should return version JSON.');
  assert(version.version === '0.0.1', 'Packed CLI should report the package version.');

  const help = run(['pnpm', 'exec', 'zw', '--help'], { cwd: appDir, capture: true });
  assert(help.includes('ZaoWu'), 'Packed CLI help should mention ZaoWu.');
  assert(help.includes('Domains:'), 'Packed CLI help should expose domain commands.');
  assert(help.includes('zw auto'), 'Packed CLI help should expose the auto domain.');
  assert(help.includes('zw plugin'), 'Packed CLI help should expose the plugin domain.');

  const doctor = JSON.parse(run(['pnpm', 'exec', 'zw', 'doctor', '--json'], { cwd: appDir, capture: true }));
  assert(['ok', 'warning'].includes(doctor.status), 'Packed CLI doctor should return a known status.');

  console.log('ZaoWu packed CLI install: ok');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
