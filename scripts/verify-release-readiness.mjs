/* global console */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(root, 'packages');

const readText = async (message, ...parts) => {
  try {
    return await readFile(path.join(root, ...parts), 'utf8');
  } catch {
    throw new Error(message);
  }
};

const readJson = async (...parts) =>
  JSON.parse(await readText(`Could not read ${parts.join('/')}.`, ...parts));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const rootPackage = await readJson('package.json');

assert(rootPackage.private === true, 'Root package must stay private.');
assert(rootPackage.packageManager === 'pnpm@10.34.1', 'Root packageManager must pin pnpm.');
assert(rootPackage.engines?.node === '>=20.19.0', 'Root package must require Node.js >=20.19.0.');
assert(rootPackage.engines?.pnpm === '>=10.34.1 <11', 'Root package must require pnpm >=10.34.1 <11.');
assert(
  rootPackage.repository?.url === 'https://github.com/zaowu-labs/zaowu.git',
  'Root repository URL must point to zaowu-labs/zaowu.'
);
assert(rootPackage.homepage === 'https://github.com/zaowu-labs/zaowu', 'Root homepage must point to the org repo.');
assert(rootPackage.license === 'Apache-2.0', 'Root license must be Apache-2.0.');

const releasePolicy = await readText(
  'Release policy must be documented before release work.',
  'docs',
  'RELEASE_POLICY.md'
);
for (const section of [
  '## Versioning',
  '## Changelog',
  '## Branches And Tags',
  '## npm Publish Rules',
  '## Provenance',
  '## Publish Permissions',
  '## Preflight',
]) {
  assert(releasePolicy.includes(section), `Release policy must include ${section}.`);
}

const changelog = await readText('CHANGELOG.md must exist before release work.', 'CHANGELOG.md');
assert(changelog.includes('## Unreleased'), 'CHANGELOG.md must include an Unreleased section.');

const packageDirs = (await readdir(packageRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

assert(packageDirs.includes('cli'), 'Workspace packages must include cli.');

for (const dir of packageDirs) {
  const pkg = await readJson('packages', dir, 'package.json');
  const expectedName = `@zaowu/${dir}`;

  assert(pkg.name === expectedName, `${dir} package name must be ${expectedName}.`);
  assert(pkg.version === rootPackage.version, `${pkg.name} version must match the root version.`);
  assert(pkg.type === 'module', `${pkg.name} must publish ESM.`);
  assert(pkg.license === rootPackage.license, `${pkg.name} license must match the root license.`);
  assert(pkg.files?.includes('dist'), `${pkg.name} package files must include dist.`);
  assert(pkg.files?.includes('README.md'), `${pkg.name} package files must include README.md.`);
  assert(pkg.main === './dist/index.js', `${pkg.name} main must point to dist/index.js.`);
  assert(pkg.types === './dist/index.d.ts', `${pkg.name} types must point to dist/index.d.ts.`);
  assert(
    pkg.exports?.['.']?.import === './dist/index.js',
    `${pkg.name} exports must expose dist/index.js.`
  );
  assert(
    pkg.exports?.['.']?.types === './dist/index.d.ts',
    `${pkg.name} exports must expose dist/index.d.ts types.`
  );
  assert(pkg.scripts?.build === 'tsc -b --pretty false', `${pkg.name} must define a build script.`);
  assert(
    pkg.scripts?.typecheck === 'tsc -b --pretty false',
    `${pkg.name} must define a typecheck script.`
  );
  assert(pkg.keywords?.includes('zaowu'), `${pkg.name} keywords must include zaowu.`);

  const packageReadme = await readText(
    `${pkg.name} must include a package-level README.md.`,
    'packages',
    dir,
    'README.md'
  );
  assert(
    packageReadme.startsWith(`# ${pkg.name}\n`),
    `${pkg.name} README.md must start with the package name.`
  );
  assert(
    packageReadme.includes('Safety:') || packageReadme.includes('Boundary:'),
    `${pkg.name} README.md must document a safety or boundary section.`
  );

  for (const [dependency, version] of Object.entries(pkg.dependencies ?? {})) {
    if (dependency.startsWith('@zaowu/')) {
      assert(
        version === 'workspace:*',
        `${pkg.name} must reference ${dependency} through workspace:*.`
      );
    }
  }

  if (dir === 'cli') {
    assert(pkg.bin?.zw === './dist/index.js', '@zaowu/cli must expose the zw binary.');
  } else {
    assert(!pkg.bin, `${pkg.name} must not expose an accidental binary.`);
  }
}

console.log('ZaoWu release readiness: ok');
