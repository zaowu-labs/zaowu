import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getValue, parseArgs } from './args';
import { COMMAND_CONTRACTS } from './command-contracts';
import { ACTION_HELP, DEFAULT_CONFIG_FILE_NAME, DOMAIN_DEFINITIONS, executeCli } from './run';

describe('executeCli', () => {
  it('shows help when no command is provided', async () => {
    const result = await executeCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('zw doctor');
    expect(result.stdout).toContain('zw dev');
  });

  it('shows version output', async () => {
    const result = await executeCli(['--version']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('1.0.0');
  });

  it('shows version output as JSON', async () => {
    const result = await executeCli(['--version', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      status: 'ok',
      version: '1.0.0',
    });
  });

  it('parses value options after positional targets', () => {
    const parsed = parseArgs([
      'data',
      'sample',
      'workbook.xlsx',
      '--sheet',
      'Details',
      '--rows',
      '1',
    ]);

    expect(parsed.positionals).toEqual(['data', 'sample', 'workbook.xlsx']);
    expect(getValue(parsed, '--sheet')).toBe('Details');
    expect(getValue(parsed, '--rows')).toBe('1');
  });

  it('shows command-specific init help', async () => {
    const result = await executeCli(['init', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('zw init [options]');
    expect(result.stdout).toContain('zw init --yes');
  });

  it('shows command-specific doctor help', async () => {
    const result = await executeCli(['doctor', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('zw doctor [options]');
    expect(result.stdout).toContain('zw doctor --json');
  });

  it('shows domain help for a scaffolded domain', async () => {
    const result = await executeCli(['dev', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ZaoWu Dev Domain');
    expect(result.stdout).toContain('zw dev commit');
    expect(result.stdout).toContain('available, sensitive');
    expect(result.stdout).toContain('zw dev review');
  });

  it('shows domain help as JSON', async () => {
    const result = await executeCli(['doc', '--help', '--json']);
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(payload.status).toBe('ok');
    expect(payload.domain.name).toBe('doc');
    expect(payload.domain.commands.map((command: { name: string }) => command.name)).toEqual([
      'summary',
      'extract',
      'convert',
      'outline',
      'search',
    ]);
  });

  it('shows action-specific help', async () => {
    const result = await executeCli(['data', 'schema', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ZaoWu Data Schema');
    expect(result.stdout).toContain('zw data schema <file.csv|file.tsv|file.xlsx>');
  });

  it('keeps automation help aligned with supported workflow formats', async () => {
    const result = await executeCli(['auto', 'validate', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('zw auto validate <workflow.json|workflow.yml|workflow.yaml>');
    expect(result.stdout).not.toContain('--sheet');
  });

  it.each(COMMAND_CONTRACTS)('keeps command contract help stable: $id', async (contract) => {
    const result = await executeCli(contract.helpArgs);

    expect(result.exitCode).toBe(0);

    for (const expectedText of contract.helpIncludes) {
      expect(result.stdout).toContain(expectedText);
    }
  });

  it.each(COMMAND_CONTRACTS.filter((contract) => contract.json))(
    'keeps JSON help contract stable: $id',
    async (contract) => {
      const result = await executeCli([...contract.helpArgs, '--json']);
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.status).toBe('ok');
      expect(payload.help).toEqual(expect.any(String));
    }
  );

  it('registers a command contract for every available action', () => {
    const availableActions = DOMAIN_DEFINITIONS.flatMap((domain) =>
      domain.commands
        .filter((command) => command.status === 'available')
        .map((command) => `${domain.name}.${command.name}`)
    ).sort();
    const contractActions = COMMAND_CONTRACTS.map((contract) => contract.id)
      .filter((id) => id.includes('.') && id !== 'root.help')
      .sort();

    expect(contractActions).toEqual(availableActions);
  });

  it('keeps a result schema registered for every available JSON action', async () => {
    const resultContracts = COMMAND_CONTRACTS.filter((contract) => contract.id !== 'root.help');

    for (const contract of resultContracts) {
      expect(contract.schemaFile, `${contract.id} is missing a schema file`).toEqual(
        expect.any(String)
      );
      await expect(
        readFile(path.join(process.cwd(), contract.schemaFile ?? ''), 'utf8')
      ).resolves.toEqual(expect.any(String));
    }
  });

  it('keeps dedicated help text for every available action', () => {
    for (const domain of DOMAIN_DEFINITIONS) {
      for (const command of domain.commands.filter(
        (candidate) => candidate.status === 'available'
      )) {
        const help = ACTION_HELP[domain.name]?.[command.name];

        expect(help, `${domain.name}.${command.name} is missing dedicated help`).toEqual(
          expect.any(String)
        );
        expect(help).not.toContain('[target] [options]');
      }
    }
  });

  it('runs available domain commands through handlers', async () => {
    const result = await executeCli(['dev', 'commit', '--json'], {
      commandRunner: (_command, args) => {
        if (args.join(' ') === 'diff --cached --name-only') {
          return 'packages/dev/src/index.ts';
        }

        if (args.join(' ') === 'diff --cached --numstat') {
          return '3\t1\tpackages/dev/src/index.ts';
        }

        if (args.join(' ') === 'diff --cached --unified=0') {
          return '';
        }

        throw new Error('unexpected command');
      },
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      status: 'ok',
      source: 'staged',
      message: 'feat(dev): update dev',
      suggestion: {
        type: 'feat',
        scope: 'dev',
      },
    });
  });

  it('runs config path after init', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      await executeCli(['init', '--yes'], { cwd: root });
      const result = await executeCli(['config', 'path', '--json'], { cwd: root });

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        schemaVersion: 1,
        status: 'ok',
        path: path.join(root, DEFAULT_CONFIG_FILE_NAME),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs the local AI ask command', async () => {
    const result = await executeCli(['ai', 'ask', 'Explain', 'ZaoWu', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      status: 'ok',
      provider: {
        id: 'echo',
      },
      output: expect.stringContaining('Explain ZaoWu'),
    });
  });

  it('previews network AI providers by default', async () => {
    const result = await executeCli([
      'ai',
      'ask',
      'Explain',
      'ZaoWu',
      '--provider',
      'openai',
      '--json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      status: 'preview',
      provider: {
        id: 'openai',
        network: true,
      },
      output: null,
      operationPlan: {
        risk: 'medium',
        confirmationRequired: true,
        network: ['openai'],
        secrets: ['OPENAI_API_KEY'],
      },
    });
  });

  it('uses the resolved AI model in operation plan subjects', async () => {
    const previousModel = process.env.OPENAI_MODEL;
    process.env.OPENAI_MODEL = '  env-model  ';

    try {
      const result = await executeCli([
        'ai',
        'ask',
        'Explain',
        'ZaoWu',
        '--provider',
        'openai',
        '--json',
      ]);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        model: 'env-model',
        operationPlan: {
          subjects: ['ai:openai', 'model:env-model'],
        },
      });
    } finally {
      if (previousModel === undefined) {
        delete process.env.OPENAI_MODEL;
      } else {
        process.env.OPENAI_MODEL = previousModel;
      }
    }
  });

  it('lists AI providers and reads file input for AI ask', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const filePath = path.join(root, 'note.md');

    await writeFile(filePath, '# ZaoWu\n\nLocal file input.\n', 'utf8');

    try {
      const providers = await executeCli(['ai', 'providers', '--json']);
      const ask = await executeCli(['ai', 'ask', 'Summarize', '--file', filePath, '--json']);

      expect(JSON.parse(providers.stdout)).toMatchObject({
        schemaVersion: 1,
        status: 'ok',
        providers: [
          {
            id: 'echo',
          },
          {
            id: 'openai',
          },
          {
            id: 'ollama',
          },
          {
            id: 'anthropic',
          },
        ],
      });
      expect(JSON.parse(ask.stdout)).toMatchObject({
        schemaVersion: 1,
        input: {
          source: 'prompt+file',
          filePath,
        },
        output: expect.stringContaining('Local file input.'),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs config validate, get, and preview set from CLI', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      await executeCli(['init', '--yes'], { cwd: root });

      const validate = await executeCli(['config', 'validate', '--json'], { cwd: root });
      const get = await executeCli(['config', 'get', 'project.name', '--json'], { cwd: root });
      const set = await executeCli(['config', 'set', 'project.name', 'demo', '--json'], {
        cwd: root,
      });
      const migrate = await executeCli(['config', 'migrate', '--json'], { cwd: root });

      expect(JSON.parse(validate.stdout)).toMatchObject({
        schemaVersion: 1,
        status: 'ok',
        config: {
          version: 1,
        },
      });
      expect(JSON.parse(get.stdout)).toMatchObject({
        key: 'project.name',
        value: 'zaowu-project',
      });
      expect(JSON.parse(set.stdout)).toMatchObject({
        schemaVersion: 1,
        status: 'preview',
        key: 'project.name',
        oldValue: 'zaowu-project',
        newValue: 'demo',
        wroteFile: false,
        operationPlan: {
          risk: 'medium',
          confirmationRequired: true,
          writes: [path.join(root, DEFAULT_CONFIG_FILE_NAME)],
        },
      });
      expect(JSON.parse(migrate.stdout)).toMatchObject({
        schemaVersion: 1,
        status: 'ok',
        changed: false,
        operationPlan: {
          confirmationRequired: false,
          writes: [],
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects confirmed config set when the preview fingerprint does not match', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      await executeCli(['init', '--yes'], { cwd: root });
      const result = await executeCli(
        [
          'config',
          'set',
          'project.name',
          'blocked',
          '--yes',
          '--plan-fingerprint',
          '0'.repeat(64),
          '--json',
        ],
        { cwd: root }
      );
      const payload = JSON.parse(result.stderr);
      const config = await readFile(path.join(root, DEFAULT_CONFIG_FILE_NAME), 'utf8');

      expect(result.exitCode).toBe(1);
      expect(payload.error.code).toBe('OPERATION_PLAN_MISMATCH');
      expect(config).toContain('name: zaowu-project');
      expect(config).not.toContain('blocked');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('applies config set when confirmation matches the preview fingerprint', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      await executeCli(['init', '--yes'], { cwd: root });
      const preview = await executeCli(['config', 'set', 'project.name', 'allowed', '--json'], {
        cwd: root,
      });
      const previewPayload = JSON.parse(preview.stdout);
      const result = await executeCli(
        [
          'config',
          'set',
          'project.name',
          'allowed',
          '--yes',
          '--plan-fingerprint',
          previewPayload.operationPlan.fingerprint,
          '--json',
        ],
        { cwd: root }
      );
      const payload = JSON.parse(result.stdout);
      const config = await readFile(path.join(root, DEFAULT_CONFIG_FILE_NAME), 'utf8');

      expect(result.exitCode).toBe(0);
      expect(payload.operationPlan.fingerprint).toBe(previewPayload.operationPlan.fingerprint);
      expect(payload.wroteFile).toBe(true);
      expect(config).toContain('name: allowed');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs dev status from CLI', async () => {
    const result = await executeCli(['dev', 'status', '--json'], {
      commandRunner: (_command, args) => {
        if (args.join(' ') === 'status --short --branch') {
          return '## main\nM  packages/dev/src/index.ts\n?? README.md';
        }

        throw new Error('unexpected command');
      },
    });

    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      status: 'ok',
      branch: 'main',
      clean: false,
      staged: ['packages/dev/src/index.ts'],
      unstaged: [],
      untracked: ['README.md'],
      operationPlan: {
        schemaVersion: 1,
        risk: 'low',
        executes: ['git status --short --branch'],
      },
    });
  });

  it('runs dev review with diff hunk analysis from CLI', async () => {
    const result = await executeCli(['dev', 'review', '--staged', '--json'], {
      commandRunner: (_command, args) => {
        if (args.join(' ') === 'diff --cached --name-only') {
          return 'packages/dev/src/index.ts';
        }

        if (args.join(' ') === 'diff --cached --numstat') {
          return '3\t1\tpackages/dev/src/index.ts';
        }

        if (args.join(' ') === 'diff --cached --unified=0') {
          return [
            'diff --git a/packages/dev/src/index.ts b/packages/dev/src/index.ts',
            '@@ -10,0 +11 @@',
            '+execFileSync("git", ["status"])',
          ].join('\n');
        }

        throw new Error('unexpected command');
      },
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      status: 'ok',
      source: 'staged',
      diffHunks: [
        {
          filePath: 'packages/dev/src/index.ts',
          header: '@@ -10,0 +11 @@',
          addedLines: 1,
          removedLines: 0,
        },
      ],
      findings: [
        {
          title: 'Change size',
        },
        {
          title: 'Tests not detected',
        },
        {
          title: 'Package tests not detected',
        },
        {
          title: 'Shell execution added',
          filePath: 'packages/dev/src/index.ts',
        },
      ],
    });
  });

  it('runs dev review with AI assistance from CLI', async () => {
    const result = await executeCli(
      ['dev', 'review', '--staged', '--ai', '--provider', 'echo', '--json'],
      {
        commandRunner: (_command, args) => {
          if (args.join(' ') === 'diff --cached --name-only') {
            return 'packages/dev/src/index.ts';
          }
          if (args.join(' ') === 'diff --cached --numstat') {
            return '3\t1\tpackages/dev/src/index.ts';
          }
          if (args.join(' ') === 'diff --cached --unified=0') {
            return 'diff --git a/packages/dev/src/index.ts b/packages/dev/src/index.ts\n@@ -10,0 +11 @@\n+execFileSync("git", ["status"])';
          }
          if (args.join(' ') === 'diff --cached') {
            return 'mock diff content';
          }
          throw new Error('unexpected command: ' + args.join(' '));
        },
      }
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.findings).toContainEqual(
      expect.objectContaining({
        title: 'AI Code Review Summary',
        detail: expect.stringContaining('Prompt received:'),
      })
    );
  });

  it('runs dev commit with AI assistance from CLI', async () => {
    const result = await executeCli(['dev', 'commit', '--ai', '--provider', 'echo', '--json'], {
      commandRunner: (_command, args) => {
        if (args.join(' ') === 'diff --cached --name-only') {
          return 'packages/dev/src/index.ts';
        }
        if (args.join(' ') === 'diff --cached --numstat') {
          return '3\t1\tpackages/dev/src/index.ts';
        }
        if (args.join(' ') === 'diff --cached --unified=0') {
          return 'diff --git a/packages/dev/src/index.ts b/packages/dev/src/index.ts\n@@ -10,0 +11 @@\n+execFileSync("git", ["status"])';
        }
        if (args.join(' ') === 'diff --cached') {
          return 'mock diff content';
        }
        throw new Error('unexpected command: ' + args.join(' '));
      },
    });

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.message).toContain('This is the local echo provider.');
  });

  it('runs dev review against a real working-tree Git diff', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-git-'));
    const filePath = path.join(root, 'note.txt');

    try {
      execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
      await writeFile(filePath, 'old\n', 'utf8');
      execFileSync('git', ['add', 'note.txt'], { cwd: root, stdio: 'ignore' });
      await writeFile(filePath, 'old\nnew\n', 'utf8');

      const result = await executeCli(['dev', 'review', '--worktree', '--json'], { cwd: root });
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload).toMatchObject({
        schemaVersion: 1,
        source: 'working-tree',
        diffHunks: [
          {
            filePath: 'note.txt',
            addedLines: 1,
            removedLines: 0,
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it('runs document summary from CLI', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const filePath = path.join(root, 'note.md');

    await writeFile(filePath, '# Note\n\nUseful content.\n', 'utf8');

    try {
      const result = await executeCli(['doc', 'summary', filePath, '--json']);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: 'ok',
        title: 'Note',
        summary: 'Useful content.',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs document outline and search from CLI', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const filePath = path.join(root, 'note.md');

    await writeFile(filePath, '# Note\n\n## Install\n\nUse ZaoWu locally.\n', 'utf8');

    try {
      const outline = await executeCli(['doc', 'outline', filePath, '--json']);
      const search = await executeCli(['doc', 'search', filePath, 'zaowu', '--json']);

      expect(JSON.parse(outline.stdout)).toMatchObject({
        outline: [
          {
            level: 1,
            title: 'Note',
          },
          {
            level: 2,
            title: 'Install',
          },
        ],
      });
      expect(JSON.parse(search.stdout)).toMatchObject({
        keyword: 'zaowu',
        matches: [
          {
            line: 5,
            text: 'Use ZaoWu locally.',
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs data inspect from CLI', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const filePath = path.join(root, 'data.csv');

    await writeFile(filePath, 'name,amount\nA,10\n', 'utf8');

    try {
      const result = await executeCli(['data', 'inspect', filePath, '--json']);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: 'ok',
        rowCount: 1,
        columns: ['name', 'amount'],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs data schema and sample from CLI', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const filePath = path.join(root, 'data.csv');

    await writeFile(filePath, 'name,amount\nA,10\nB,20\n', 'utf8');

    try {
      const schema = await executeCli(['data', 'schema', filePath, '--json']);
      const sample = await executeCli(['data', 'sample', filePath, '--rows', '1', '--json']);

      expect(JSON.parse(schema.stdout)).toMatchObject({
        columns: [
          {
            column: 'name',
            type: 'string',
          },
          {
            column: 'amount',
            type: 'number',
          },
        ],
      });
      expect(JSON.parse(sample.stdout)).toMatchObject({
        rowCount: 1,
        rows: [
          {
            name: 'A',
            amount: '10',
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs data sheets from CLI', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const filePath = path.join(root, 'data.csv');

    await writeFile(filePath, 'name,amount\nA,10\n', 'utf8');

    try {
      const result = await executeCli(['data', 'sheets', filePath, '--json']);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: 'ok',
        filePath,
        sheets: ['default'],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs auto plan from CLI', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const filePath = path.join(root, 'workflow.yml');

    await writeFile(
      filePath,
      'name: demo\nvars:\n  target: ZaoWu\nsteps:\n  - name: hello\n    message: Hello {{target}}\n',
      'utf8'
    );

    try {
      const plan = await executeCli(['auto', 'plan', filePath, '--json']);

      expect(JSON.parse(plan.stdout)).toMatchObject({
        schemaVersion: 1,
        workflow: {
          name: 'demo',
        },
        policy: {
          schemaVersion: 1,
          shell: 'blocked',
        },
        sandbox: {
          schemaVersion: 1,
          root: 'workflow-directory',
          workflowDirectory: root,
          shellCommands: 'blocked',
        },
        steps: [
          {
            name: 'hello',
            preview: 'Hello ZaoWu',
            blocked: false,
            policyDecision: 'allowed',
            operationPlan: {
              risk: 'low',
              confirmationRequired: false,
              executes: [],
            },
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('previews sensitive plugin and web commands by default', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      const plugin = await executeCli(['plugin', 'install', 'readme-gen', '--json'], { cwd: root });
      const web = await executeCli(['web', 'inspect', 'https://example.com', '--json']);

      expect(JSON.parse(plugin.stdout)).toMatchObject({
        status: 'preview',
        wroteFile: false,
        operationPlan: {
          risk: 'medium',
          confirmationRequired: true,
        },
      });
      expect(JSON.parse(web.stdout)).toMatchObject({
        status: 'preview',
        url: 'https://example.com/',
        operationPlan: {
          risk: 'medium',
          confirmationRequired: true,
          network: ['https://example.com/'],
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs plugin validate from CLI', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    await writeFile(
      path.join(root, 'zaowu.plugin.json'),
      JSON.stringify({ id: 'local-tool' }),
      'utf8'
    );

    try {
      const validation = await executeCli(['plugin', 'validate', root, '--json']);

      expect(JSON.parse(validation.stdout)).toMatchObject({
        status: 'ok',
        manifest: {
          id: 'local-tool',
        },
        errors: [],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns a JSON error for unknown domain actions', async () => {
    const result = await executeCli(['doc', 'unknown', '--json']);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: 'UNKNOWN_DOMAIN_ACTION',
        message: 'Unknown command: zw doc unknown.',
        why: 'ZaoWu has the `doc` domain, but it does not have an action named `unknown`.',
        fix: 'Run `zw doc --help` to see commands for this domain.',
        exitCode: 1,
      },
    });
  });

  it('returns a formatted error for unknown commands', async () => {
    const result = await executeCli(['unknown']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Error: Unknown command: unknown.');
    expect(result.stderr).toContain('How to fix:');
  });

  it('returns a JSON error for unknown commands', async () => {
    const result = await executeCli(['unknown', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: 'UNKNOWN_COMMAND',
        message: 'Unknown command: unknown.',
        why: 'ZaoWu does not have a command named `zw unknown`.',
        fix: 'Run `zw --help` to see available commands.',
        exitCode: 1,
      },
    });
  });

  it('checks local environment health as JSON', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      await executeCli(['init', '--yes'], { cwd: root });

      const result = await executeCli(['doctor', '--json'], {
        cwd: root,
        nodeVersion: '20.19.0',
        commandRunner: (command) => {
          if (command === 'git') {
            return 'git version 2.44.0';
          }

          if (command === 'pnpm') {
            return '10.34.1';
          }

          throw new Error('unexpected command');
        },
      });

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        schemaVersion: 1,
        status: 'ok',
        checks: [
          {
            name: 'Node.js',
            status: 'ok',
            version: 'v20.19.0',
          },
          {
            name: 'Git',
            status: 'ok',
            version: '2.44.0',
          },
          {
            name: 'pnpm',
            status: 'ok',
            version: '10.34.1',
          },
          {
            name: 'Config',
            status: 'ok',
            details: DEFAULT_CONFIG_FILE_NAME,
          },
          {
            name: 'AI provider',
            status: 'ok',
            details: 'echo (local, configured)',
          },
          {
            name: 'Command matrix',
            status: 'ok',
            details: `${COMMAND_CONTRACTS.length + 3} command surface(s) tracked`,
          },
        ],
        nextSteps: [],
        operationPlan: {
          schemaVersion: 1,
          risk: 'low',
          reads: [
            'nearest ZaoWu config path',
            'resolved ZaoWu config',
            'AI provider environment variable presence',
            'command contract registry',
          ],
          executes: ['git --version', 'pnpm --version', 'corepack pnpm --version'],
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('warns when the configured AI provider is missing environment setup', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const previousKey = process.env.OPENAI_API_KEY;

    try {
      delete process.env.OPENAI_API_KEY;
      await executeCli(['init', '--yes'], { cwd: root });
      await executeCli(['config', 'set', 'ai.provider', 'openai', '--yes'], { cwd: root });

      const result = await executeCli(['doctor', '--json'], {
        cwd: root,
        nodeVersion: '20.19.0',
        commandRunner: (command) => {
          if (command === 'git') {
            return 'git version 2.44.0';
          }

          if (command === 'pnpm') {
            return '10.34.1';
          }

          throw new Error('unexpected command');
        },
      });
      const payload = JSON.parse(result.stdout);
      const aiCheck = payload.checks.find(
        (check: { name: string }) => check.name === 'AI provider'
      );

      expect(result.exitCode).toBe(0);
      expect(payload.status).toBe('warning');
      expect(aiCheck).toEqual({
        name: 'AI provider',
        status: 'warning',
        details: 'openai (network, missing config)',
        fix: 'Missing environment variable(s): OPENAI_API_KEY.',
      });
      expect(payload.nextSteps).toContain('Missing environment variable(s): OPENAI_API_KEY.');
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }

      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps doctor actionable when config exists but cannot be parsed', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      await writeFile(path.join(root, DEFAULT_CONFIG_FILE_NAME), 'not valid config\n', 'utf8');

      const result = await executeCli(['doctor', '--json'], {
        cwd: root,
        nodeVersion: '20.19.0',
        commandRunner: (command) => {
          if (command === 'git') {
            return 'git version 2.44.0';
          }

          if (command === 'pnpm') {
            return '10.34.1';
          }

          throw new Error('unexpected command');
        },
      });
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.status).toBe('warning');
      expect(payload.checks).toEqual(
        expect.arrayContaining([
          {
            name: 'Config',
            status: 'warning',
            details: DEFAULT_CONFIG_FILE_NAME,
            fix: 'Use the supported simple subset (top-level keys + one level of 2-space indented sections) or switch to JSON (zaowu.config.json).',
          },
          {
            name: 'AI provider',
            status: 'warning',
            details: 'not checked because config is invalid',
            fix: 'Run `zw config validate` before enabling provider-backed AI commands.',
          },
        ])
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('shows missing doctor checks as actionable next steps', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      const result = await executeCli(['doctor'], {
        cwd: root,
        nodeVersion: '18.0.0',
        commandRunner: () => {
          throw new Error('missing');
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Status: Warning');
      expect(result.stdout).toContain('- Git: missing');
      expect(result.stdout).toContain('- pnpm: missing');
      expect(result.stdout).toContain('- Config: missing');
      expect(result.stdout).toContain('- AI provider: ok echo (local, configured)');
      expect(result.stdout).toContain(
        `- Command matrix: ok ${COMMAND_CONTRACTS.length + 3} command surface(s) tracked`
      );
      expect(result.stdout).toContain('Install Node.js 20.19.0 or newer.');
      expect(result.stdout).toContain('Run `corepack enable` or install pnpm.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts pnpm provided through corepack', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      const result = await executeCli(['doctor', '--json'], {
        cwd: root,
        nodeVersion: '20.19.0',
        commandRunner: (command, args) => {
          if (command === 'git') {
            return 'git version 2.44.0';
          }

          if (command === 'pnpm') {
            throw new Error('pnpm shim missing');
          }

          if (command === 'corepack' && args.join(' ') === 'pnpm --version') {
            return '10.34.1';
          }

          throw new Error('unexpected command');
        },
      });

      const payload = JSON.parse(result.stdout);
      const pnpmCheck = payload.checks.find((check: { name: string }) => check.name === 'pnpm');

      expect(pnpmCheck).toEqual({
        name: 'pnpm',
        status: 'ok',
        version: '10.34.1',
        details: 'via corepack',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('warns when pnpm is outside the supported range', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      await executeCli(['init', '--yes'], { cwd: root });

      const result = await executeCli(['doctor', '--json'], {
        cwd: root,
        nodeVersion: '20.19.0',
        commandRunner: (command) => {
          if (command === 'git') {
            return 'git version 2.44.0';
          }

          if (command === 'pnpm') {
            return '11.5.1';
          }

          throw new Error('unexpected command');
        },
      });

      const payload = JSON.parse(result.stdout);
      const pnpmCheck = payload.checks.find((check: { name: string }) => check.name === 'pnpm');

      expect(payload.status).toBe('warning');
      expect(pnpmCheck).toEqual({
        name: 'pnpm',
        status: 'warning',
        version: '11.5.1',
        fix: 'Use pnpm 10.34.1 through Corepack: corepack prepare pnpm@10.34.1 --activate.',
      });
      expect(payload.nextSteps).toContain(
        'Use pnpm 10.34.1 through Corepack: corepack prepare pnpm@10.34.1 --activate.'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('previews init by default without writing files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      const result = await executeCli(['init'], { cwd: root });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No files were written.');
      await expect(readFile(path.join(root, DEFAULT_CONFIG_FILE_NAME), 'utf8')).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('previews init as JSON without writing files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      const result = await executeCli(['init', '--json'], { cwd: root });
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.schemaVersion).toBe(1);
      expect(payload.status).toBe('ok');
      expect(payload.dryRun).toBe(true);
      expect(payload.wouldCreate).toBe(path.join(root, DEFAULT_CONFIG_FILE_NAME));
      expect(payload.operationPlan).toMatchObject({
        schemaVersion: 1,
        risk: 'medium',
        confirmationRequired: true,
        subjects: [`init:${path.join(root, DEFAULT_CONFIG_FILE_NAME)}`],
        writes: [path.join(root, DEFAULT_CONFIG_FILE_NAME)],
        fingerprintAlgorithm: 'sha256-v1',
        fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      await expect(readFile(path.join(root, DEFAULT_CONFIG_FILE_NAME), 'utf8')).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects confirmed init when the preview fingerprint does not match', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      const result = await executeCli(
        ['init', '--yes', '--plan-fingerprint', '0'.repeat(64), '--json'],
        { cwd: root }
      );
      const payload = JSON.parse(result.stderr);

      expect(result.exitCode).toBe(1);
      expect(payload.error).toMatchObject({
        code: 'OPERATION_PLAN_MISMATCH',
      });
      await expect(readFile(path.join(root, DEFAULT_CONFIG_FILE_NAME), 'utf8')).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('creates config when confirmed init matches the preview fingerprint', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      const preview = await executeCli(['init', '--json'], { cwd: root });
      const previewPayload = JSON.parse(preview.stdout);
      const result = await executeCli(
        ['init', '--yes', '--plan-fingerprint', previewPayload.operationPlan.fingerprint, '--json'],
        { cwd: root }
      );
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload.operationPlan.fingerprint).toBe(previewPayload.operationPlan.fingerprint);
      expect(payload.operationPlan.confirmationRequired).toBe(false);
      await expect(readFile(path.join(root, DEFAULT_CONFIG_FILE_NAME), 'utf8')).resolves.toContain(
        'version: 1'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('creates config when init is confirmed', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const nested = path.join(root, 'nested');

    try {
      await mkdir(nested);
      const result = await executeCli(['init', '--yes'], { cwd: root });

      expect(result.exitCode).toBe(0);
      await expect(readFile(path.join(root, DEFAULT_CONFIG_FILE_NAME), 'utf8')).resolves.toContain(
        'version: 1'
      );

      const doctor = await executeCli(['doctor'], {
        cwd: nested,
        nodeVersion: '20.19.0',
        commandRunner: () => '1.0.0',
      });

      expect(doctor.stdout).toContain('Config: ok');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns versioned JSON when init is confirmed', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      const result = await executeCli(['init', '--yes', '--json'], { cwd: root });
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload).toMatchObject({
        schemaVersion: 1,
        status: 'ok',
        created: path.join(root, DEFAULT_CONFIG_FILE_NAME),
        operationPlan: {
          schemaVersion: 1,
          risk: 'medium',
          confirmationRequired: false,
          subjects: [`init:${path.join(root, DEFAULT_CONFIG_FILE_NAME)}`],
          writes: [path.join(root, DEFAULT_CONFIG_FILE_NAME)],
          fingerprintAlgorithm: 'sha256-v1',
          fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      });
      await expect(readFile(path.join(root, DEFAULT_CONFIG_FILE_NAME), 'utf8')).resolves.toContain(
        'version: 1'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not overwrite an existing config', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      await executeCli(['init', '--yes'], { cwd: root });
      const result = await executeCli(['init', '--yes'], { cwd: root });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Error: ZaoWu config already exists.');
      expect(result.stderr).toContain('How to fix:');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('creates teaching quiz with canvas-csv format from CLI', async () => {
    const result = await executeCli([
      'teach',
      'quiz',
      'TypeScript is cool. Interfaces define shape.',
      '--format',
      'canvas-csv',
      '--json',
    ]);

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.format).toBe('canvas-csv');
    expect(payload.content).toContain('Type,Question Text,Points');
    expect(payload.content).toContain('TypeScript is cool.');
  });
});
