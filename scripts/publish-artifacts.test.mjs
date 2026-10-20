import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPublishablePackage } from './publish-artifacts.mjs';

const expected = { name: '@zaowu-labs/cli', version: '1.0.4' };
const manifest = {
  ...expected,
  bin: { zw: 'dist/index.js' },
  dependencies: { '@zaowu-labs/core': expected.version },
};
const entries = [
  'package/package.json',
  'package/README.md',
  'package/dist/index.js',
  'package/dist/index.d.ts',
];

test('accepts a compiled release tarball with resolved workspace dependencies', () => {
  assert.doesNotThrow(() => assertPublishablePackage(manifest, entries, expected));
});
test('rejects the unbuilt tarball produced by a fresh publish checkout', () => {
  assert.throws(
    () => assertPublishablePackage(manifest, entries.slice(0, 2), expected),
    /missing dist\/index.js/
  );
});
test('rejects missing declarations and missing CLI executables', () => {
  assert.throws(
    () => assertPublishablePackage(manifest, entries.slice(0, 3), expected),
    /missing dist\/index.d.ts/
  );
  assert.throws(
    () =>
      assertPublishablePackage({ ...manifest, bin: { zw: 'dist/missing.js' } }, entries, expected),
    /missing dist\/missing.js/
  );
});
test('rejects wrong release names, versions, and private packages', () => {
  for (const change of [{ name: 'zaowu' }, { version: '0.0.1' }, { private: true }]) {
    assert.throws(() => assertPublishablePackage({ ...manifest, ...change }, entries, expected));
  }
});
test('rejects unresolved workspace, file, and link dependencies', () => {
  for (const value of ['workspace:*', 'file:../core.tgz', 'link:../core']) {
    assert.throws(
      () =>
        assertPublishablePackage(
          { ...manifest, dependencies: { '@zaowu-labs/core': value } },
          entries,
          expected
        ),
      /local dependency/
    );
  }
});
test('rejects internal dependencies from another release', () => {
  assert.throws(
    () =>
      assertPublishablePackage(
        { ...manifest, dependencies: { '@zaowu-labs/core': '1.0.2' } },
        entries,
        expected
      ),
    /release version/
  );
});
