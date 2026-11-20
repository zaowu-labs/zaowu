/* global console, process */
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmGlobal = process.argv[2] === '--npm-global';
const { version: expectedVersion, packageManager } = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8')
);
const scratch = mkdtempSync(path.join(tmpdir(), 'zaowu-pack-install-'));
const appDir = path.join(scratch, 'app');
const tarballDir = path.join(appDir, 'tarballs');
const packageNamesByTarballPrefix = new Map([
  ['zaowu-labs-ai-', '@zaowu-labs/ai'],
  ['zaowu-labs-auto-', '@zaowu-labs/auto'],
  ['zaowu-labs-cli-', '@zaowu-labs/cli'],
  ['zaowu-labs-config-', '@zaowu-labs/config'],
  ['zaowu-labs-core-', '@zaowu-labs/core'],
  ['zaowu-labs-data-', '@zaowu-labs/data'],
  ['zaowu-labs-dev-', '@zaowu-labs/dev'],
  ['zaowu-labs-doc-', '@zaowu-labs/doc'],
  ['zaowu-labs-plugin-', '@zaowu-labs/plugin'],
  ['zaowu-labs-teach-', '@zaowu-labs/teach'],
  ['zaowu-labs-web-', '@zaowu-labs/web'],
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

const verifyNpmGlobalInstall = (tarballs) => {
  const prefix = path.join(scratch, 'npm-prefix');
  const npmrc = path.join(scratch, 'npmrc');
  // The candidate packages must resolve from these tarballs, even if this
  // version also exists on npm. Other dependencies use the public registry.
  writeFileSync(npmrc, '@zaowu-labs:registry=http://127.0.0.1:9/\n');
  const npmVersion = execFileSync('npm', ['--version'], { cwd: appDir, encoding: 'utf8' }).trim();
  execFileSync(
    'npm',
    [
      'install',
      '--global',
      '--prefix',
      prefix,
      '--cache',
      path.join(scratch, 'npm-cache'),
      '--userconfig',
      npmrc,
      '--registry=https://registry.npmjs.org',
      '--fetch-retries=1',
      '--fetch-timeout=90000',
      '--no-audit',
      '--no-fund',
      ...(Number(npmVersion.split('.')[0]) >= 12 ? ['--allow-remote=all'] : []),
      ...tarballs,
    ],
    { cwd: appDir, stdio: 'inherit', timeout: 240_000 }
  );

  const bin = path.join(prefix, 'bin');
  const runtime = path.join(scratch, 'runtime');
  mkdirSync(runtime);
  symlinkSync(process.execPath, path.join(runtime, 'node'));
  const zw = (args, input) =>
    execFileSync('zw', args, {
      cwd: appDir,
      encoding: 'utf8',
      env: { ...process.env, PATH: [bin, runtime, '/usr/bin', '/bin'].join(path.delimiter) },
      input,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
  assert(
    JSON.parse(zw(['--version', '--json'])).version === expectedVersion,
    'npm zw version must match the candidate.'
  );
  const doctor = JSON.parse(zw(['doctor', '--json']));
  if (process.platform === 'darwin') {
    assert(
      doctor.checks.some(
        (check) => check.name === 'zw on PATH' && check.version === expectedVersion
      ),
      'doctor must find the npm-installed candidate on PATH.'
    );
  }
  const document = zw([
    'doc',
    'extract',
    path.join(root, 'examples', 'docs', 'report.md'),
    '--json',
  ]);
  const answer = zw(
    ['ai', 'ask', 'Read the report', '--stdin', '--provider', 'echo', '--raw'],
    document
  );
  assert(
    answer.includes('Smoke Report'),
    'npm-installed CLI must support the document-to-AI pipeline.'
  );
  assert(
    answer.startsWith('This is the local echo provider.'),
    'Pipeline stdout must contain the raw answer.'
  );
  assert(answer.endsWith(document), 'Raw stdout must preserve the input without extra newlines.');
  console.log(`ZaoWu npm ${npmVersion} global-prefix install: ok`);
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
    tarballs.some((filePath) => path.basename(filePath).startsWith('zaowu-labs-cli-')),
    'CLI tarball should be present.'
  );
  assert(
    tarballs.length === packageNamesByTarballPrefix.size,
    'All workspace package tarballs should be present.'
  );

  if (npmGlobal) {
    verifyNpmGlobalInstall(tarballs);
  } else {
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
          packageManager,
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

    const version = JSON.parse(
      run(['pnpm', 'exec', 'zw', '--version', '--json'], { cwd: appDir, capture: true })
    );
    assert(version.status === 'ok', 'Packed CLI should return version JSON.');
    assert(version.version === expectedVersion, 'Packed CLI should report the package version.');

    const help = run(['pnpm', 'exec', 'zw', '--help'], { cwd: appDir, capture: true });
    assert(help.includes('ZaoWu'), 'Packed CLI help should mention ZaoWu.');
    assert(help.includes('Domains:'), 'Packed CLI help should expose domain commands.');
    assert(help.includes('zw auto'), 'Packed CLI help should expose the auto domain.');
    assert(help.includes('zw plugin'), 'Packed CLI help should expose the plugin domain.');

    const doctor = JSON.parse(
      run(['pnpm', 'exec', 'zw', 'doctor', '--json'], { cwd: appDir, capture: true })
    );
    assert(
      ['ok', 'warning'].includes(doctor.status),
      'Packed CLI doctor should return a known status.'
    );

    console.log('ZaoWu packed CLI install: ok');
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
