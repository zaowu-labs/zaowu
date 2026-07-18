/* global console, process */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
const readJson = async (...parts) => JSON.parse(await readFile(path.join(root, ...parts), 'utf8'));
const fail = (message) => {
  throw new Error(message);
};

const rootPackage = await readJson('package.json');
const expectedTag = `v${rootPackage.version}`;
const releaseTag = process.env.RELEASE_TAG?.trim();

if (!releaseTag) fail('RELEASE_TAG is required (for example v1.1.0).');
if (releaseTag !== expectedTag) {
  fail(`Release tag ${releaseTag} must match package version ${expectedTag}.`);
}
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(releaseTag)) {
  fail(`Release tag ${releaseTag} is not a supported semantic version tag.`);
}

const git = async (...args) => (await run('git', args, { cwd: root })).stdout.trim();
const taggedCommit = await git('rev-parse', '--verify', `${releaseTag}^{commit}`);
const checkedOutCommit = await git('rev-parse', 'HEAD');
if (taggedCommit !== checkedOutCommit) {
  fail(`Checked-out commit ${checkedOutCommit} does not match ${releaseTag} (${taggedCommit}).`);
}
try {
  await git('merge-base', '--is-ancestor', taggedCommit, 'origin/main');
} catch {
  fail(`Release tag ${releaseTag} must point to a commit reachable from origin/main.`);
}

const packageDirs = (await readdir(path.join(root, 'packages'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const directory of packageDirs) {
  const pkg = await readJson('packages', directory, 'package.json');
  if (pkg.version !== rootPackage.version) {
    fail(`${pkg.name} version ${pkg.version} must match root version ${rootPackage.version}.`);
  }
  if (pkg.publishConfig?.access !== 'public') {
    fail(`${pkg.name} must declare publishConfig.access as public.`);
  }
}

console.log(`Release candidate verified: ${releaseTag}, ${packageDirs.length} public packages.`);
