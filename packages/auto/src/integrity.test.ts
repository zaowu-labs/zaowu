import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  planWorkflowContent,
  runWorkflowPlan,
  validateWorkflowContent,
  validateWorkflowFile,
} from './index';

describe('workflow input integrity', () => {
  it('bounds workflow bytes before parsing or allocating all file contents', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-workflow-large-'));
    const file = path.join(cwd, 'workflow.yml');
    try {
      const handle = await open(file, 'w');
      try {
        await handle.truncate(4 * 1024 * 1024 + 1);
      } finally {
        await handle.close();
      }
      await expect(validateWorkflowFile(file)).rejects.toMatchObject({
        code: 'WORKFLOW_PARSE_FAILED',
        message: 'Workflow file is too large.',
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
  it.each(['constructor', 'toString', '__proto__'])(
    'does not substitute inherited variable %s',
    (name) => {
      const plan = planWorkflowContent(
        JSON.stringify({ steps: [{ name: 'message', message: `Hello {{${name}}}` }] }),
        'workflow.json'
      );
      expect(plan.steps[0].blocked).toBe(true);
      expect(plan.steps[0].reason).toContain('Missing variable');
    }
  );
  it('preserves explicitly provided prototype-named YAML variables', () => {
    const plan = planWorkflowContent(
      'variables:\n  __proto__: own-value\nsteps:\n  - name: message\n    message: "{{__proto__}}"\n'
    );
    expect(plan.steps[0]).toMatchObject({ blocked: false, preview: 'own-value' });
  });
  it.each([2, 'future'])('does not execute writes for unsupported version %s', async (version) => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-workflow-version-'));
    try {
      const plan = planWorkflowContent(
        JSON.stringify({
          version,
          permissions: { fileWrites: 'prompt' },
          steps: [{ name: 'write', writeFile: { path: 'output.txt', content: 'unreviewed' } }],
        }),
        path.join(cwd, 'workflow.json')
      );
      expect(plan.steps[0].blocked).toBe(true);
      const run = await runWorkflowPlan(plan, { yes: true });
      expect(run.executed).toEqual([]);
      await expect(readFile(path.join(cwd, 'output.txt'))).rejects.toThrow();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
  it.each(['[]', 'true', '42', '"workflow"'])('rejects a non-object JSON root %s', (content) => {
    expect(() => validateWorkflowContent(content, 'workflow.json')).toThrow(
      'Could not parse workflow.'
    );
  });
});
