import { describe, expect, it } from 'vitest';
import { createOperationPlan } from './index';

describe('operation plans', () => {
  it('adds a stable fingerprint for the operational footprint', () => {
    const preview = createOperationPlan({
      confirmationRequired: true,
      subjects: ['config:project.name'],
      reads: ['zw.yml'],
      writes: ['zw.yml'],
    });
    const confirmed = createOperationPlan({
      confirmationRequired: false,
      subjects: ['config:project.name'],
      reads: ['zw.yml'],
      writes: ['zw.yml'],
    });

    expect(preview.fingerprintAlgorithm).toBe('sha256-v1');
    expect(preview.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(confirmed.fingerprint).toBe(preview.fingerprint);
  });

  it('changes the fingerprint when the operational footprint changes', () => {
    const first = createOperationPlan({
      subjects: ['plugin:readme-gen'],
      writes: ['.zaowu/plugins/readme-gen.json'],
    });
    const second = createOperationPlan({
      subjects: ['plugin:readme-gen'],
      deletes: ['.zaowu/plugins/readme-gen.json'],
    });

    expect(second.fingerprint).not.toBe(first.fingerprint);
  });

  it('keeps the same fingerprint regardless of list element order', () => {
    const first = createOperationPlan({
      subjects: ['plugin:readme-gen', 'plugin:test'],
      reads: ['file-a.txt', 'file-b.txt'],
    });
    const second = createOperationPlan({
      subjects: ['plugin:test', 'plugin:readme-gen'],
      reads: ['file-b.txt', 'file-a.txt'],
    });

    expect(second.fingerprint).toBe(first.fingerprint);
  });
});
