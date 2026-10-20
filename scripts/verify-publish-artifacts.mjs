/* global console, process */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPublishArtifacts } from './publish-artifacts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseVersion = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const manifests = readdirSync(path.join(root, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) =>
    JSON.parse(readFileSync(path.join(root, 'packages', entry.name, 'package.json'), 'utf8'))
  );
for (const manifest of manifests) {
  if (manifest.version !== releaseVersion)
    throw new Error(`${manifest.name} must match release ${releaseVersion}.`);
}
const directory = process.argv[2]
  ? path.resolve(process.argv[2])
  : mkdtempSync(path.join(tmpdir(), 'zaowu-publish-artifacts-'));
try {
  if (!process.argv[2]) {
    const args = ['pnpm', '--filter', './packages/*', 'pack', '--pack-destination', directory];
    const windows = process.platform === 'win32';
    execFileSync(
      windows ? 'cmd.exe' : 'corepack',
      windows ? ['/d', '/s', '/c', 'corepack', ...args] : args,
      { cwd: root, stdio: 'inherit' }
    );
  }
  const artifacts = verifyPublishArtifacts(directory, manifests);
  for (const artifact of artifacts) console.log(`${artifact.filename}: ${artifact.integrity}`);
  console.log(`Publish artifacts verified: ${artifacts.length} compiled public packages.`);
} finally {
  if (!process.argv[2]) rmSync(directory, { recursive: true, force: true });
}
