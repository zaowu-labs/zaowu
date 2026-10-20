import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateProductionAudit } from './production-audit-policy.mjs';

const exception = {
  ghsa: 'GHSA-hp3w-g68c-fv3c',
  module: 'sprintf-js',
  version: '1.0.3',
  severity: 'moderate',
  path: 'packages__doc>mammoth>argparse>sprintf-js',
  expiresOn: '2026-11-19',
};
const advisory = {
  github_advisory_id: exception.ghsa,
  module_name: exception.module,
  severity: exception.severity,
  findings: [{ version: exception.version, paths: [exception.path] }],
};
const report = (value = advisory) => ({
  advisories: { test: value },
  metadata: { vulnerabilities: { moderate: 1, high: 0 } },
});
const now = new Date('2026-10-20T00:00:00Z');

test('accepts only the reviewed advisory and exact dependency path before expiry', () => {
  assert.equal(evaluateProductionAudit(report(), [exception], now).accepted.length, 1);
});
test('rejects the exception after its review window expires', () => {
  const result = evaluateProductionAudit(report(), [exception], new Date('2026-11-20T00:00:00Z'));
  assert.equal(result.rejected.length, 1);
});
test('rejects a changed dependency path or an additional affected path', () => {
  for (const paths of [['other>sprintf-js'], [exception.path, 'other>sprintf-js']]) {
    const changed = { ...advisory, findings: [{ version: exception.version, paths }] };
    assert.equal(evaluateProductionAudit(report(changed), [exception], now).rejected.length, 1);
  }
});
test('rejects changed severity, package, version, or advisory', () => {
  for (const change of [
    { severity: 'high' },
    { module_name: 'another-package' },
    { github_advisory_id: 'GHSA-new-advisory' },
    { findings: [{ version: '1.1.3', paths: [exception.path] }] },
  ]) {
    assert.equal(
      evaluateProductionAudit(report({ ...advisory, ...change }), [exception], now).rejected.length,
      1
    );
  }
});
test('rejects missing finding details and invalid expiration dates', () => {
  assert.equal(
    evaluateProductionAudit(report({ ...advisory, findings: [] }), [exception], now).rejected
      .length,
    1
  );
  assert.equal(
    evaluateProductionAudit(report(), [{ ...exception, expiresOn: 'invalid' }], now).rejected
      .length,
    1
  );
});
test('fails closed on registry errors or incomplete audit results', () => {
  assert.throws(() => evaluateProductionAudit({ error: 'network unavailable' }, [exception], now));
  assert.throws(() =>
    evaluateProductionAudit(
      { advisories: {}, metadata: { vulnerabilities: { high: '0' } } },
      [exception],
      now
    )
  );
  assert.throws(() =>
    evaluateProductionAudit(
      { advisories: {}, metadata: { vulnerabilities: { high: 1 } } },
      [exception],
      now
    )
  );
});
test('passes an audit with no advisories', () => {
  assert.equal(
    evaluateProductionAudit({ advisories: {}, metadata: { vulnerabilities: { high: 0 } } }, [], now)
      .rejected.length,
    0
  );
});
