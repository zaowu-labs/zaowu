import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTO_DOMAIN,
  planWorkflowContent,
  runWorkflowFile,
  validateWorkflowContent,
} from './index';

describe('auto domain', () => {
  it('declares automation workflow commands', () => {
    expect(AUTO_DOMAIN.name).toBe('auto');
    expect(AUTO_DOMAIN.commands.map((command) => command.name)).toEqual([
      'validate',
      'plan',
      'run',
    ]);
  });

  it('validates a simple workflow', () => {
    expect(
      validateWorkflowContent('name: demo\nsteps:\n  - name: hello\n    message: Hello\n')
    ).toEqual({
      status: 'ok',
      filePath: 'workflow.yml',
      workflow: {
        name: 'demo',
        variables: {},
        steps: [
          {
            name: 'hello',
            message: 'Hello',
          },
        ],
      },
      warnings: [],
    });
  });

  it('validates workflow files with a UTF-8 BOM', () => {
    expect(
      validateWorkflowContent('\uFEFFname: demo\nsteps:\n  - name: hello\n    message: Hello\n')
        .workflow.name
    ).toBe('demo');
  });

  it('warns about shell steps', () => {
    expect(
      validateWorkflowContent('name: demo\nsteps:\n  - name: build\n    run: pnpm build\n').warnings
    ).toEqual(['Step `build` uses shell execution, which this first version will not run.']);
  });

  it('plans variable substitution and blocked shell steps', () => {
    expect(
      planWorkflowContent(
        'name: demo\nvars:\n  target: ZaoWu\nsteps:\n  - name: hello\n    message: Hello {{target}}\n  - name: build\n    run: pnpm build\n'
      )
    ).toMatchObject({
      steps: [
        {
          name: 'hello',
          action: 'message',
          preview: 'Hello ZaoWu',
          blocked: false,
        },
        {
          name: 'build',
          action: 'shell',
          preview: 'pnpm build',
          blocked: true,
        },
      ],
    });
  });

  it('warns about undefined variables', () => {
    expect(
      validateWorkflowContent(
        'name: demo\nsteps:\n  - name: hello\n    message: Hello {{target}}\n'
      ).warnings
    ).toEqual(['Step `hello` references undefined variable `target`.']);
  });

  it('previews workflow runs by default', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-auto-'));
    const filePath = path.join(root, 'workflow.yml');

    await writeFile(filePath, 'name: demo\nsteps:\n  - name: hello\n    message: Hello\n', 'utf8');

    try {
      await expect(runWorkflowFile(filePath)).resolves.toMatchObject({
        status: 'preview',
        executed: [],
        skipped: ['hello: dry-run'],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
