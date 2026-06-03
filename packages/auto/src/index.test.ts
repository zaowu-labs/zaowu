import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTO_DOMAIN, runWorkflowFile, validateWorkflowContent } from './index';

describe('auto domain', () => {
  it('declares automation workflow commands', () => {
    expect(AUTO_DOMAIN.name).toBe('auto');
    expect(AUTO_DOMAIN.commands.map((command) => command.name)).toEqual(['validate', 'run']);
  });

  it('validates a simple workflow', () => {
    expect(
      validateWorkflowContent('name: demo\nsteps:\n  - name: hello\n    message: Hello\n')
    ).toEqual({
      status: 'ok',
      filePath: 'workflow.yml',
      workflow: {
        name: 'demo',
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
