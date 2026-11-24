import { mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import {
  planWorkflowContent,
  runWorkflowPlan,
  validateWorkflowContent,
  validateWorkflowFile,
} from './index';

describe('workflow input integrity', () => {
  it.each(['json', 'yaml'])(
    'honors both variable keys and preserves file content in %s',
    async (format) => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-variables-'));
      const text = '  line one\nline two\n';
      try {
        for (const key of ['vars', 'variables']) {
          const workflow = {
            [key]: { text },
            permissions: { fileWrites: 'prompt' },
            steps: [{ name: 'save', writeFile: { path: key, content: '{{text}}' } }],
          };
          const plan = planWorkflowContent(
            format === 'json' ? JSON.stringify(workflow) : YAML.stringify(workflow),
            path.join(cwd, 'workflow.' + format)
          );
          expect(plan.steps[0].blocked).toBe(false);
          await runWorkflowPlan(plan, { yes: true });
          expect(await readFile(path.join(cwd, key), 'utf8')).toBe(text);
        }
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );

  it.each(['json', 'yaml'])('validates both variable containers in %s', (format) => {
    const validate = (fields: Record<string, unknown>) => {
      const workflow = { name: 'demo', ...fields, steps: [{ name: 'hello', message: 'hello' }] };
      return validateWorkflowContent(
        format === 'json' ? JSON.stringify(workflow) : YAML.stringify(workflow),
        'workflow.' + format
      ).workflow.variables;
    };
    for (const key of ['vars', 'variables']) {
      const alias = key === 'vars' ? 'variables' : 'vars';
      for (const invalid of [[], 'mistyped', null, false, 0]) {
        for (const fields of [{ [key]: invalid }, { [key]: invalid, [alias]: {} }]) {
          expect(() => validate(fields)).toThrow(
            expect.objectContaining({
              code: 'WORKFLOW_PARSE_FAILED',
              why: expect.stringContaining(key),
            })
          );
        }
      }
      expect(validate({ [key]: {} })).toEqual({});
      expect(validate({ [key]: { count: 0, enabled: false } })).toEqual({
        count: '0',
        enabled: 'false',
      });
    }
    expect(validate({})).toEqual({});
    expect(validate({ vars: { source: 'short' }, variables: { source: 'long' } })).toEqual({
      source: format === 'json' ? 'long' : 'short',
    });
  });

  it.each(['json', 'yaml'])('rejects incomplete or mistyped writeFile actions in %s', (format) => {
    for (const action of [
      { path: 'result' },
      { path: 'result', content: {} },
      { path: 5, content: '' },
      null,
    ]) {
      const workflow = {
        permissions: { fileWrites: 'prompt' },
        steps: [{ name: 'save', writeFile: action }],
      };
      expect(() =>
        planWorkflowContent(
          format === 'json' ? JSON.stringify(workflow) : YAML.stringify(workflow),
          'workflow.' + format
        )
      ).toThrow(/Could not parse workflow/);
    }
  });
  it.each(['existing file', 'duplicate path', 'missing directory'])(
    'leaves earlier workflow outputs alone when a later step has a known conflict: %s',
    async (conflict) => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-workflow-preflight-'));
      try {
        const first = 'first.txt';
        const second =
          conflict === 'duplicate path'
            ? './first.txt'
            : conflict === 'missing directory'
              ? 'missing/last.txt'
              : 'last.txt';
        if (conflict === 'existing file') await writeFile(path.join(cwd, second), 'original');
        const workflow = {
          permissions: { fileWrites: 'prompt' },
          steps: [first, second].map((target, index) => ({
            name: `save${index}`,
            writeFile: { path: target, content: 'new' },
          })),
        };
        const plan = planWorkflowContent(JSON.stringify(workflow), path.join(cwd, 'workflow.json'));
        await expect(runWorkflowPlan(plan, { yes: true })).rejects.toMatchObject({
          code: 'WORKFLOW_STEP_FAILED',
        });
        await expect(readFile(path.join(cwd, first))).rejects.toHaveProperty('code', 'ENOENT');
        if (conflict === 'existing file')
          expect(await readFile(path.join(cwd, second), 'utf8')).toBe('original');
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  );
  it.each([
    ['Report.txt', 'report.txt'],
    ['Café.txt', 'Cafe\u0301.txt'],
  ])('checks %s and %s on the destination filesystem before writing', async (one, two) => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'zaowu-workflow-spelling-'));
    try {
      await writeFile(path.join(cwd, one), 'fixture');
      const sameFile =
        (await readFile(path.join(cwd, two), 'utf8').catch(() => undefined)) === 'fixture';
      await rm(path.join(cwd, one));
      const outputs = ['first.txt', one, two];
      const workflow = {
        permissions: { fileWrites: 'prompt' },
        steps: outputs.map((file) => ({ name: file, writeFile: { path: file, content: file } })),
      };
      const plan = planWorkflowContent(JSON.stringify(workflow), path.join(cwd, 'flow.json'));
      expect(plan.steps[0].operationPlan.notes).toContain(
        'Confirmed runs may check similar output names in a temporary directory beside the outputs.'
      );
      await runWorkflowPlan(plan);
      expect(await readdir(cwd)).toEqual([]);
      if (sameFile) {
        await expect(runWorkflowPlan(plan, { yes: true })).rejects.toMatchObject({
          code: 'WORKFLOW_STEP_FAILED',
          why: expect.stringContaining('Several workflow steps'),
        });
        expect(await readdir(cwd)).toEqual([]);
      } else {
        await runWorkflowPlan(plan, { yes: true });
        expect(
          await Promise.all(outputs.map((file) => readFile(path.join(cwd, file), 'utf8')))
        ).toEqual(outputs);
        expect(await readdir(cwd)).toHaveLength(outputs.length);
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

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
  it.each([2, 'future', null, ''])(
    'does not execute writes for unsupported version %s',
    async (version) => {
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
    }
  );
  it.each(['[]', 'true', '42', '"workflow"'])('rejects a non-object JSON root %s', (content) => {
    expect(() => validateWorkflowContent(content, 'workflow.json')).toThrow(
      'Could not parse workflow.'
    );
  });
});
