import { describe, expect, it } from 'vitest';
import { createOperationPlan, formatOperationPlan } from './handler-utils';

describe('compact human operation plans', () => {
  it('keeps every target and confirmation instruction without mutating JSON', () => {
    const plan = createOperationPlan({
      risk: 'high',
      confirmationRequired: true,
      subjects: ['subject:one', 'subject:two'],
      reads: ['input one', 'input two'],
      writes: ['new file'],
      deletes: ['old file'],
      executes: ['git reset --hard origin/main'],
      network: ['https://example.invalid/path'],
      secrets: ['EXAMPLE_API_KEY'],
      notes: ['Requires explicit consent.'],
    });
    const before = JSON.stringify(plan);
    const human = formatOperationPlan(plan);
    for (const values of [
      plan.subjects,
      plan.reads,
      plan.writes,
      plan.deletes,
      plan.executes,
      plan.network,
      plan.secrets,
      plan.notes,
    ]) {
      for (const value of values) expect(human).toContain(value);
    }
    expect(human).toContain(`--yes --plan-fingerprint ${plan.fingerprint}`);
    expect(JSON.stringify(plan)).toBe(before);
  });

  it('groups empty sections into one explicit line', () => {
    const plan = createOperationPlan({ risk: 'low', reads: ['input'] });
    const human = formatOperationPlan(plan);
    expect(human).toContain('Read:\n- input');
    expect(human).toContain(
      'No targets: Subjects, Write, Delete, Execute, Network, Secrets, Notes.'
    );
    expect(human).not.toContain('- none');
  });
});
