import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const assertPublishablePackage = (manifest, entries, expected) => {
  assert.equal(manifest.name, expected.name, 'Tarball package name must match its workspace.');
  assert.equal(manifest.version, expected.version, 'Tarball version must match the release.');
  assert.notEqual(manifest.private, true, 'Private packages must never be published.');
  const required = ['package.json', 'README.md', 'dist/index.js', 'dist/index.d.ts'];
  const bins =
    typeof manifest.bin === 'string' ? [manifest.bin] : Object.values(manifest.bin ?? {});
  for (const entry of [...required, ...bins]) {
    assert(
      entries.includes(`package/${entry.replace(/^\.\//, '')}`),
      `Tarball is missing ${entry}. Build before publishing.`
    );
  }
  for (const [name, version] of Object.entries({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
  })) {
    assert(
      !/^(?:workspace|link|file):/.test(version),
      `Tarball contains a local dependency: ${name}.`
    );
    if (name.startsWith('@zaowu-labs/')) {
      assert.equal(
        version,
        expected.version,
        `Internal dependency ${name} must use the release version.`
      );
    }
  }
};

export const verifyPublishArtifacts = (directory, manifests) => {
  const files = readdirSync(directory)
    .filter((file) => file.endsWith('.tgz'))
    .sort();
  assert.equal(
    files.length,
    manifests.length,
    'All public workspace tarballs must be present, with no extras.'
  );
  return manifests.map((expected) => {
    const filename = `${expected.name.replace(/^@/, '').replace('/', '-')}-${expected.version}.tgz`;
    assert(files.includes(filename), `Release tarball is missing: ${filename}.`);
    const archive = path.join(directory, filename);
    const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean);
    const manifest = JSON.parse(
      execFileSync('tar', ['-xzOf', archive, 'package/package.json'], { encoding: 'utf8' })
    );
    assertPublishablePackage(manifest, entries, expected);
    return {
      name: manifest.name,
      version: manifest.version,
      filename,
      integrity: `sha512-${createHash('sha512').update(readFileSync(archive)).digest('base64')}`,
    };
  });
};
