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
      schemaVersion: 1,
      status: 'ok',
      filePath: 'workflow.yml',
      workflow: {
        version: 1,
        name: 'demo',
        variables: {},
        permissions: {
          shell: 'blocked',
          fileWrites: 'blocked',
          network: 'blocked',
        },
        steps: [
          {
            name: 'hello',
            message: 'Hello',
          },
        ],
      },
      policy: {
        schemaVersion: 1,
        shell: 'blocked',
        fileWrites: 'blocked',
        network: 'blocked',
      },
      sandbox: {
        schemaVersion: 1,
        root: 'workflow-directory',
        workflowDirectory: process.cwd(),
        shellCommands: 'blocked',
        fileWrites: 'blocked',
        network: 'blocked',
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

  it('parses workflow execution policy without enabling shell execution', () => {
    expect(
      planWorkflowContent(
        'name: demo\npermissions:\n  shell: prompt\nsteps:\n  - name: build\n    run: pnpm build\n'
      )
    ).toMatchObject({
      schemaVersion: 1,
      policy: {
        schemaVersion: 1,
        shell: 'prompt',
        fileWrites: 'blocked',
        network: 'blocked',
      },
      sandbox: {
        schemaVersion: 1,
        shellCommands: 'blocked',
      },
      steps: [
        {
          name: 'build',
          action: 'shell',
          requiredPermission: 'shell',
          policyDecision: 'blocked',
          blocked: true,
          reason:
            'Shell permission is prompt-only, but shell execution is not supported in this foundation version.',
          operationPlan: {
            schemaVersion: 1,
            risk: 'high',
            confirmationRequired: true,
            executes: ['pnpm build'],
          },
        },
      ],
      warnings: [
        'Step `build` uses shell execution, which this first version will not run.',
        'Step `build` requests shell permission, but shell execution remains blocked in this foundation version.',
      ],
    });
  });

  it('warns about invalid workflow permission values', () => {
    expect(
      validateWorkflowContent(
        'name: demo\npermissions:\n  shell: always\nsteps:\n  - name: hello\n    message: Hi\n'
      ).warnings
    ).toEqual(['Permission `shell` value `always` is invalid; defaulting to blocked.']);
  });

  it('warns about unsupported workflow permission keys', () => {
    expect(
      validateWorkflowContent(
        'name: demo\npermissions:\n  filesystem: prompt\nsteps:\n  - name: hello\n    message: Hi\n'
      ).warnings
    ).toEqual(['Permission `filesystem` is not supported; ignoring it.']);
  });

  it('warns when JSON workflow permissions are not an object', () => {
    expect(
      validateWorkflowContent(
        JSON.stringify({
          name: 'demo',
          permissions: 'prompt',
          steps: [
            {
              name: 'hello',
              message: 'Hi',
            },
          ],
        }),
        'workflow.json'
      ).warnings
    ).toEqual(['Permissions must be an object; defaulting to blocked.']);
  });

  it('warns about unsupported explicit workflow versions', () => {
    expect(
      validateWorkflowContent('version: 2\nname: demo\nsteps:\n  - name: hello\n    message: Hi\n')
        .warnings
    ).toEqual(['Workflow version 2 is not supported; this foundation version expects 1.']);
  });

  it('warns about invalid explicit workflow versions', () => {
    expect(
      validateWorkflowContent(
        'version: later\nname: demo\nsteps:\n  - name: hello\n    message: Hi\n'
      ).warnings
    ).toEqual(['Workflow version `later` is invalid; defaulting to 1.']);
  });

  it('rejects unsupported workflow file extensions', () => {
    expect(() => validateWorkflowContent('name: demo\nsteps: []\n', 'workflow.ps1')).toThrow(
      'Workflow format is not supported yet.'
    );
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
          policyDecision: 'allowed',
          operationPlan: {
            schemaVersion: 1,
            risk: 'low',
            confirmationRequired: false,
            executes: [],
          },
        },
        {
          name: 'build',
          action: 'shell',
          preview: 'pnpm build',
          blocked: true,
          requiredPermission: 'shell',
          policyDecision: 'blocked',
          reason: 'Shell permission is blocked by workflow policy.',
          operationPlan: {
            schemaVersion: 1,
            risk: 'high',
            confirmationRequired: true,
            executes: ['pnpm build'],
          },
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
        schemaVersion: 1,
        status: 'preview',
        sandbox: {
          schemaVersion: 1,
          workflowDirectory: root,
          shellCommands: 'blocked',
        },
        executed: [],
        skipped: ['hello: dry-run'],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
