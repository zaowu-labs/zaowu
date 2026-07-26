import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getValue, parseArgs } from './args';
import { COMMAND_CONTRACTS } from './command-contracts';
import { ACTION_HELP } from './help-text';
import { BOOLEAN_OPTIONS, COMMAND_OPTIONS, VALUE_OPTIONS } from './option-registry';
import { DEFAULT_CONFIG_FILE_NAME, DOMAIN_DEFINITIONS, executeCli } from './run';

describe('action help / option registry consistency', () => {
  it('documents exactly the options each command supports', () => {
    for (const [commandKey, allowed] of Object.entries(COMMAND_OPTIONS)) {
      if (!commandKey.includes(':')) {
        continue; // Root commands (init, doctor) have dedicated help builders.
      }

      const [domainName, action] = commandKey.split(':');
      const helpText = ACTION_HELP[domainName]?.[action];

      expect(helpText, `missing ACTION_HELP for ${commandKey}`).toBeTruthy();

      const documented = new Set([...helpText!.matchAll(/--[a-z][a-z-]*/g)].map((m) => m[0]));
      const allowedSet = new Set(allowed);

      // Every option shown in help must actually be supported.
      for (const option of documented) {
        expect(
          allowedSet.has(option),
          `${commandKey} help documents unsupported option ${option}`
        ).toBe(true);
      }

      // Every supported option must be documented, except the universal
      // --help/--version which the root help surface covers.
      for (const option of allowedSet) {
        if (option === '--help' || option === '--version') {
          continue;
        }

        expect(
          documented.has(option),
          `${commandKey} supports ${option} but its help does not document it`
        ).toBe(true);
      }
    }
  });
});

describe('option registry', () => {
  it('declares every command option exactly once as value-taking or boolean', () => {
    const valueOptions = new Set<string>(VALUE_OPTIONS);
    const booleanOptions = new Set<string>(BOOLEAN_OPTIONS);

    // The two declarations must be disjoint.
    for (const option of valueOptions) {
      expect(booleanOptions).not.toContain(option);
    }

    // Every option referenced by a command must be declared, so the parser
    // knows whether it consumes a value.
    const usedOptions = new Set(Object.values(COMMAND_OPTIONS).flat());

    for (const option of usedOptions) {
      expect(
        valueOptions.has(option) || booleanOptions.has(option),
        `${option} is used by a command but not declared in VALUE_OPTIONS or BOOLEAN_OPTIONS`
      ).toBe(true);
    }

    // Every declared option must be used somewhere; unused declarations are
    // dead registry entries.
    for (const option of [...valueOptions, ...booleanOptions]) {
      expect(usedOptions.has(option), `${option} is declared but used by no command`).toBe(true);
    }
  });
});

describe('executeCli', () => {
  it('shows help when no command is provided', async () => {
    const result = await executeCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('zw doctor');
    expect(result.stdout).toContain('zw dev');
    expect(result.stdout).toContain('https://github.com/zaowu-labs/zaowu#quick-start');
  });

  it('shows version output', async () => {
    const result = await executeCli(['--version']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('1.0.2');
  });

  it('shows version output as JSON', async () => {
    const result = await executeCli(['--version', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      status: 'ok',
      version: '1.0.2',
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

  it('parses key-value option syntax using equals sign', () => {
    const parsed = parseArgs(['data', 'sample', 'workbook.xlsx', '--sheet=Details', '--rows=5']);

    expect(parsed.positionals).toEqual(['data', 'sample', 'workbook.xlsx']);
    expect(getValue(parsed, '--sheet')).toBe('Details');
    expect(getValue(parsed, '--rows')).toBe('5');
    expect([...parsed.options]).toEqual(['--sheet', '--rows']);
  });

  it('treats everything after a bare -- separator as positionals', () => {
    const parsed = parseArgs(['teach', 'plan', '--json', '--', '--not-an-option', '--file']);

    expect(parsed.positionals).toEqual(['teach', 'plan', '--not-an-option', '--file']);
    expect(parsed.flags.has('--json')).toBe(true);
    expect(parsed.flags.has('--file')).toBe(false);
    expect(parsed.missingValues).toEqual([]);
  });

  it('records an option value that starts with -- as missing, not swallowed', () => {
    const parsed = parseArgs(['ai', 'ask', 'question', '--file', '--json']);

    // `--json` must stay a flag rather than becoming the --file value.
    expect(parsed.missingValues).toEqual(['--file']);
    expect(parsed.flags.has('--json')).toBe(true);
  });

  it('records an empty =value as missing and keeps last duplicate value', () => {
    const empty = parseArgs(['data', 'sample', 'file.csv', '--sheet=']);
    expect(empty.missingValues).toEqual(['--sheet']);

    // Duplicate value options follow common CLI convention: last one wins.
    const duplicated = parseArgs(['data', 'sample', 'file.csv', '--sheet', 'A', '--sheet', 'B']);
    expect(getValue(duplicated, '--sheet')).toBe('B');
  });

  it('tracks options that are missing required values', () => {
    const parsed = parseArgs([
      'doc',
      'convert',
      'README.md',
      '--output',
      '--yes',
      '--model=',
      '--count',
    ]);

    expect(parsed.positionals).toEqual(['doc', 'convert', 'README.md']);
    expect(parsed.missingValues).toEqual(['--output', '--model', '--count']);
    expect(getValue(parsed, '--output')).toBeUndefined();
  });

  it('returns an actionable JSON error for options without values', async () => {
    const result = await executeCli(['doc', 'convert', 'README.md', '--output', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: 'OPTION_VALUE_REQUIRED',
        message: 'Option value is required.',
        why: 'The option --output must be followed by a value.',
        fix: 'Provide a value, for example `--output value`, or remove the option.',
        exitCode: 1,
      },
    });
    expect(result.stderr).not.toContain('at ');
  });

  it('returns an actionable JSON error for invalid option values', async () => {
    const result = await executeCli(['doc', 'convert', 'README.md', '--format', 'pdf', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        code: 'OPTION_VALUE_INVALID',
        message: 'Option value is invalid.',
        why: 'The option --format received `pdf`, but expected `markdown` or `text`.',
      },
    });
  });

  it('rejects invalid numeric options before silent fallback', async () => {
    const rows = await executeCli(['data', 'sample', 'README.md', '--rows', 'abc', '--json']);
    const count = await executeCli(['teach', 'quiz', 'TypeScript', '--count', '25', '--json']);

    expect(rows.exitCode).toBe(1);
    expect(JSON.parse(rows.stderr).error.code).toBe('OPTION_VALUE_INVALID');
    expect(count.exitCode).toBe(1);
    expect(JSON.parse(count.stderr).error.code).toBe('OPTION_VALUE_INVALID');
  });

  it('rejects unsupported and misspelled options instead of silently ignoring them', async () => {
    const misspelled = await executeCli(['web', 'fetch', 'https://example.com', '--yse', '--json']);
    const wrongCommand = await executeCli(['doctor', '--output=result.json', '--json']);

    expect(misspelled.exitCode).toBe(1);
    expect(JSON.parse(misspelled.stderr)).toMatchObject({
      error: {
        code: 'OPTION_UNSUPPORTED',
        message: 'Option is not supported by this command.',
        why: 'The option --yse cannot be used with `zw web fetch`.',
        fix: 'Run `zw web fetch --help` to see the supported options.',
      },
    });
    expect(wrongCommand.exitCode).toBe(1);
    expect(JSON.parse(wrongCommand.stderr).error).toMatchObject({
      code: 'OPTION_UNSUPPORTED',
      why: 'The option --output cannot be used with `zw doctor`.',
    });
  });

  it('shows command-specific init help', async () => {
    const result = await executeCli(['init', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('zw init [options]');
    expect(result.stdout).toContain('zw init --yes');
    expect(result.stdout).toContain('--plan-fingerprint <hash>');
    expect(result.stdout).toContain('zw init --yes --plan-fingerprint <hash>');
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
    expect(payload.domain).toBe('doc');
    expect(payload.commands.map((command: { name: string }) => command.name)).toEqual([
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
    expect(result.stdout).toContain('zw data schema <file.csv|file.tsv|file.json|file.xlsx>');
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

  it.each(COMMAND_CONTRACTS.filter((contract) => contract.sensitive))(
    'documents plan fingerprint confirmation for sensitive command: $id',
    async (contract) => {
      const result = await executeCli(contract.helpArgs);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('--plan-fingerprint <hash>');
    }
  );

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
      endpoint: null,
      output: expect.stringContaining('Explain ZaoWu'),
      usage: null,
    });
  });

  it('prints full output in human mode when the provider does not stream', async () => {
    const chunks: string[] = [];
    const result = await executeCli(['ai', 'ask', 'Explain', 'ZaoWu'], {
      onChunk: (chunk) => {
        chunks.push(chunk);
      },
    });

    expect(result.exitCode).toBe(0);
    // The echo provider never calls onChunk, so the handler must fall back to
    // emitting the full response output instead of silently printing nothing.
    expect(chunks.join('')).toContain('Explain ZaoWu');
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
      endpoint: 'https://api.openai.com/v1/responses',
      output: null,
      usage: null,
      operationPlan: {
        risk: 'medium',
        confirmationRequired: true,
        network: ['https://api.openai.com/v1/responses'],
        secrets: ['OPENAI_API_KEY'],
      },
    });
  });

  it('requires preview and confirmation for Ollama HTTP requests', async () => {
    const result = await executeCli([
      'ai',
      'ask',
      'Explain',
      'ZaoWu',
      '--provider',
      'ollama',
      '--json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'preview',
      provider: {
        id: 'ollama',
        network: true,
      },
      operationPlan: {
        confirmationRequired: true,
        network: ['http://localhost:11434/api/generate'],
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
          subjects: expect.arrayContaining([
            'ai:openai',
            'model:env-model',
            expect.stringMatching(/^content-sha256:[0-9a-f]{64}$/),
            'content-length:13',
          ]),
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

  it('surfaces internal error stacks only when ZAOWU_DEBUG is set', async () => {
    const previousDebug = process.env.ZAOWU_DEBUG;
    // A type-broken cwd simulates a genuine internal bug: path.resolve throws
    // a raw TypeError that no domain wraps into a ZaoWuError.
    const brokenOptions = { cwd: 123 as unknown as string };

    try {
      delete process.env.ZAOWU_DEBUG;
      const withoutDebug = await executeCli(['config', 'path'], brokenOptions);
      expect(withoutDebug.exitCode).toBe(1);
      expect(withoutDebug.stderr).toContain('Unexpected internal error');
      expect(withoutDebug.stderr).not.toContain('Debug (ZAOWU_DEBUG)');

      process.env.ZAOWU_DEBUG = '1';
      const withDebug = await executeCli(['config', 'path'], brokenOptions);
      expect(withDebug.stderr).toContain('Debug (ZAOWU_DEBUG)');
      expect(withDebug.stderr).toContain('TypeError');

      // JSON output stays contract-stable even in debug mode.
      const jsonDebug = await executeCli(['config', 'path', '--json'], brokenOptions);
      expect(jsonDebug.stderr).not.toContain('Debug (ZAOWU_DEBUG)');
      expect(JSON.parse(jsonDebug.stderr).error.code).toBe('INTERNAL_ERROR');
    } finally {
      if (previousDebug === undefined) {
        delete process.env.ZAOWU_DEBUG;
      } else {
        process.env.ZAOWU_DEBUG = previousDebug;
      }
    }
  });

  it('reports unknown commands and actions before option errors', async () => {
    // An unknown action must not be masked by an option complaint.
    const unknownAction = await executeCli(['ai', 'bogus', '--file', 'x', '--json']);
    expect(JSON.parse(unknownAction.stderr).error.code).toBe('UNKNOWN_DOMAIN_ACTION');

    // An unknown command must not be masked by an option complaint either.
    const unknownCommand = await executeCli(['bogus', '--file', 'x', '--json']);
    expect(JSON.parse(unknownCommand.stderr).error.code).toBe('UNKNOWN_COMMAND');
  });

  it('emits a stable string domain field in JSON help output', async () => {
    const domainHelp = await executeCli(['ai', '--help', '--json']);
    const actionHelp = await executeCli(['ai', 'ask', '--help', '--json']);
    const bareDomain = await executeCli(['ai', '--json']);

    // Machine-readable contract: `domain` is always the domain name string,
    // never the full domain definition object.
    expect(JSON.parse(domainHelp.stdout).domain).toBe('ai');
    expect(JSON.parse(actionHelp.stdout)).toMatchObject({ domain: 'ai', action: 'ask' });
    expect(JSON.parse(bareDomain.stdout).domain).toBe('ai');
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

  it('rejects a confirmed AI request whose file content changed after preview', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const filePath = path.join(root, 'note.md');

    await writeFile(filePath, 'original secret content', 'utf8');

    try {
      const preview = await executeCli([
        'ai',
        'ask',
        'Summarize',
        '--file',
        filePath,
        '--provider',
        'openai',
        '--json',
      ]);
      const previewPayload = JSON.parse(preview.stdout);
      const fingerprint = previewPayload.operationPlan.fingerprint as string;

      expect(previewPayload.status).toBe('preview');
      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);

      // Swap the file content after the preview; the stale fingerprint must not
      // authorize sending the new content to the network provider.
      await writeFile(filePath, 'swapped malicious content', 'utf8');

      const confirmed = await executeCli([
        'ai',
        'ask',
        'Summarize',
        '--file',
        filePath,
        '--provider',
        'openai',
        '--yes',
        '--plan-fingerprint',
        fingerprint,
        '--json',
      ]);

      expect(confirmed.exitCode).toBe(1);
      expect(JSON.parse(confirmed.stderr).error.code).toBe('OPERATION_PLAN_MISMATCH');
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
      const setPayload = JSON.parse(set.stdout);
      expect(setPayload).toMatchObject({
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
      expect(setPayload.operationPlan.subjects).toEqual(
        expect.arrayContaining([
          'config:project.name',
          'old-value:"zaowu-project"',
          'new-value:"demo"',
          expect.stringMatching(/^content-sha256:[a-f0-9]{64}$/),
          expect.stringMatching(/^content-length:\d+$/),
        ])
      );
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
      expect(config).toContain('name: "zaowu-project"');
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
      expect(config).toContain('name: "allowed"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a config value change made with a fingerprint from another value', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      await executeCli(['init', '--yes'], { cwd: root });
      const preview = await executeCli(['config', 'set', 'project.name', 'first', '--json'], {
        cwd: root,
      });
      const previewPayload = JSON.parse(preview.stdout);
      const result = await executeCli(
        [
          'config',
          'set',
          'project.name',
          'second',
          '--yes',
          '--plan-fingerprint',
          previewPayload.operationPlan.fingerprint,
          '--json',
        ],
        { cwd: root }
      );
      const config = await readFile(path.join(root, DEFAULT_CONFIG_FILE_NAME), 'utf8');

      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stderr).error.code).toBe('OPERATION_PLAN_MISMATCH');
      expect(config).toContain('name: "zaowu-project"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('applies config set globally when --global option is provided', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const originalAppData = process.env.APPDATA;
    const homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(root);
    if (process.platform === 'win32') {
      process.env.APPDATA = path.join(root, 'AppData');
    }

    try {
      const preview = await executeCli(
        ['config', 'set', 'project.name', 'global-project', '--global', '--json'],
        {
          cwd: root,
        }
      );
      const previewPayload = JSON.parse(preview.stdout);
      const result = await executeCli(
        [
          'config',
          'set',
          'project.name',
          'global-project',
          '--global',
          '--yes',
          '--plan-fingerprint',
          previewPayload.operationPlan.fingerprint,
          '--json',
        ],
        { cwd: root }
      );
      const payload = JSON.parse(result.stdout);
      expect(result.exitCode).toBe(0);
      expect(payload.wroteFile).toBe(true);

      const globalPath = payload.filePath;
      const config = await readFile(globalPath, 'utf8');
      expect(config).toContain('name: "global-project"');

      const localYml = path.join(root, DEFAULT_CONFIG_FILE_NAME);
      await expect(readFile(localYml, 'utf8')).rejects.toThrow();
    } finally {
      homedirSpy.mockRestore();
      if (originalAppData !== undefined) {
        process.env.APPDATA = originalAppData;
      } else {
        delete process.env.APPDATA;
      }
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

  it('keeps confirmed dev sync aligned with its previewed operation plan', async () => {
    const commandRunner = (_command: string, args: readonly string[]): string => {
      switch (args.join(' ')) {
        case 'status --short --branch':
          return '## main...origin/main';
        case 'rev-parse HEAD':
          return 'commit_hash_123';
        case 'fetch origin':
          return 'fetched';
        case 'reset --hard origin/main':
          return 'reset';
        default:
          throw new Error(`unexpected command: ${args.join(' ')}`);
      }
    };
    const preview = await executeCli(['dev', 'sync', '--json'], { commandRunner });
    const previewPayload = JSON.parse(preview.stdout);
    const confirmed = await executeCli(
      [
        'dev',
        'sync',
        '--yes',
        '--plan-fingerprint',
        previewPayload.operationPlan.fingerprint,
        '--json',
      ],
      { commandRunner }
    );
    const confirmedPayload = JSON.parse(confirmed.stdout);

    expect(confirmed.exitCode).toBe(0);
    expect(confirmedPayload.operationPlan).toMatchObject({
      confirmationRequired: false,
      executes: ['git fetch origin', 'git reset --hard origin/main'],
      network: ['git remote origin'],
      fingerprint: previewPayload.operationPlan.fingerprint,
    });
  });

  it('rejects stale dev sync confirmations when git status changes', async () => {
    let statusOutput = '## main...origin/main';
    const calls: string[] = [];
    const commandRunner = (_command: string, args: readonly string[]): string => {
      calls.push(args.join(' '));
      switch (args.join(' ')) {
        case 'status --short --branch':
          return statusOutput;
        case 'rev-parse HEAD':
          return 'commit_hash_123';
        case 'fetch origin':
          return 'fetched';
        case 'reset --hard origin/main':
          return 'reset';
        default:
          throw new Error(`unexpected command: ${args.join(' ')}`);
      }
    };
    const preview = await executeCli(['dev', 'sync', '--json'], { commandRunner });
    const previewPayload = JSON.parse(preview.stdout);

    expect(previewPayload.operationPlan.subjects).toEqual(
      expect.arrayContaining([
        'git:main',
        'git-head:commit_hash_123',
        expect.stringMatching(/^git-status-sha256:[a-f0-9]{64}$/),
      ])
    );

    statusOutput = '## main...origin/main\n M README.md';
    const staleConfirm = await executeCli(
      [
        'dev',
        'sync',
        '--yes',
        '--plan-fingerprint',
        previewPayload.operationPlan.fingerprint,
        '--json',
      ],
      { commandRunner }
    );

    expect(staleConfirm.exitCode).toBe(1);
    expect(JSON.parse(staleConfirm.stderr).error.code).toBe('OPERATION_PLAN_MISMATCH');
    expect(calls).not.toContain('fetch origin');
  });

  it('requires --discard-local for confirmed dev sync with local discard risk', async () => {
    const commandRunner = (_command: string, args: readonly string[]): string => {
      switch (args.join(' ')) {
        case 'status --short --branch':
          return '## main...origin/main [ahead 1]\nM  packages/dev/src/index.ts';
        case 'rev-parse HEAD':
          return 'commit_hash_123';
        case 'fetch origin':
          return 'fetched';
        case 'reset --hard origin/main':
          return 'reset';
        default:
          throw new Error(`unexpected command: ${args.join(' ')}`);
      }
    };
    const preview = await executeCli(['dev', 'sync', '--json'], { commandRunner });
    const previewPayload = JSON.parse(preview.stdout);
    const refused = await executeCli(
      [
        'dev',
        'sync',
        '--yes',
        '--plan-fingerprint',
        previewPayload.operationPlan.fingerprint,
        '--json',
      ],
      { commandRunner }
    );
    const confirmed = await executeCli(
      [
        'dev',
        'sync',
        '--yes',
        '--discard-local',
        '--plan-fingerprint',
        previewPayload.operationPlan.fingerprint,
        '--json',
      ],
      { commandRunner }
    );

    expect(refused.exitCode).toBe(1);
    expect(JSON.parse(refused.stderr).error.code).toBe('GIT_SYNC_DISCARD_CONFIRMATION_REQUIRED');
    expect(confirmed.exitCode).toBe(0);
    expect(JSON.parse(confirmed.stdout).operationPlan.fingerprint).toBe(
      previewPayload.operationPlan.fingerprint
    );
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
          startLine: 11,
          endLine: 11,
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
          line: 11,
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

  it('previews dev commit --ai with a network provider instead of sending the diff', async () => {
    const commandRunner = (_command: string, args: readonly string[]) => {
      if (args.join(' ') === 'diff --cached --name-only') {
        return 'packages/dev/src/index.ts';
      }
      if (args.join(' ') === 'diff --cached --numstat') {
        return '3\t1\tpackages/dev/src/index.ts';
      }
      if (args.join(' ') === 'diff --cached --unified=0') {
        return 'diff --git a/x b/x\n@@ -1,0 +2 @@\n+line';
      }
      if (args.join(' ') === 'diff --cached') {
        return 'mock diff content';
      }
      throw new Error('unexpected command: ' + args.join(' '));
    };
    const preview = await executeCli(['dev', 'commit', '--ai', '--provider', 'ollama', '--json'], {
      commandRunner,
    });

    expect(preview.exitCode).toBe(0);
    const payload = JSON.parse(preview.stdout);

    expect(payload.status).toBe('preview');
    expect(payload.operationPlan.confirmationRequired).toBe(true);
    expect(payload.operationPlan.network).toEqual(['http://localhost:11434/api/generate']);
    expect(payload.operationPlan.subjects).toEqual(
      expect.arrayContaining(['ai:ollama', expect.stringMatching(/^content-sha256:[a-f0-9]{64}$/)])
    );
  });

  it('rejects confirmed dev commit --ai when the staged diff changed after preview', async () => {
    const makeRunner = (diff: string) => (_command: string, args: readonly string[]) => {
      if (args.join(' ') === 'diff --cached --name-only') {
        return 'packages/dev/src/index.ts';
      }
      if (args.join(' ') === 'diff --cached --numstat') {
        return '3\t1\tpackages/dev/src/index.ts';
      }
      if (args.join(' ') === 'diff --cached --unified=0') {
        return 'diff --git a/x b/x\n@@ -1,0 +2 @@\n+line';
      }
      if (args.join(' ') === 'diff --cached') {
        return diff;
      }
      throw new Error('unexpected command: ' + args.join(' '));
    };

    const preview = await executeCli(['dev', 'commit', '--ai', '--provider', 'ollama', '--json'], {
      commandRunner: makeRunner('original diff'),
    });
    const fingerprint = JSON.parse(preview.stdout).operationPlan.fingerprint as string;

    // The staged diff changes between preview and confirm; the stale
    // fingerprint must not authorize sending the new diff to the provider.
    const confirmed = await executeCli(
      [
        'dev',
        'commit',
        '--ai',
        '--provider',
        'ollama',
        '--yes',
        '--plan-fingerprint',
        fingerprint,
        '--json',
      ],
      { commandRunner: makeRunner('swapped diff') }
    );

    expect(confirmed.exitCode).toBe(1);
    expect(JSON.parse(confirmed.stderr).error.code).toBe('OPERATION_PLAN_MISMATCH');
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

  it('rejects stale document conversion confirmations when input content changes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const filePath = path.join(root, 'note.md');
    const outputPath = path.join(root, 'note.out.md');

    try {
      await writeFile(filePath, '# Note\n\nOriginal.\n', 'utf8');
      const preview = await executeCli([
        'doc',
        'convert',
        filePath,
        '--output',
        outputPath,
        '--json',
      ]);
      const previewPayload = JSON.parse(preview.stdout);

      expect(previewPayload.operationPlan.subjects).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^content-sha256:[a-f0-9]{64}$/),
          expect.stringMatching(/^content-length:\d+$/),
        ])
      );

      const humanPreview = await executeCli(['doc', 'convert', filePath, '--output', outputPath]);
      expect(humanPreview.stdout).toContain('To write exactly this converted output, run:');
      expect(humanPreview.stdout).toContain('zw doc convert');
      expect(humanPreview.stdout).toContain('--yes --plan-fingerprint');

      await writeFile(filePath, '# Note\n\nChanged.\n', 'utf8');
      const staleConfirm = await executeCli([
        'doc',
        'convert',
        filePath,
        '--output',
        outputPath,
        '--yes',
        '--plan-fingerprint',
        previewPayload.operationPlan.fingerprint,
        '--json',
      ]);

      expect(staleConfirm.exitCode).toBe(1);
      expect(JSON.parse(staleConfirm.stderr).error.code).toBe('OPERATION_PLAN_MISMATCH');
      await expect(readFile(outputPath, 'utf8')).rejects.toThrow();
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

  it('rejects stale data clean confirmations when input content changes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const filePath = path.join(root, 'data.csv');
    const outputPath = path.join(root, 'clean.csv');

    try {
      await writeFile(filePath, 'name,amount\nA,10\n', 'utf8');
      const preview = await executeCli([
        'data',
        'clean',
        filePath,
        '--output',
        outputPath,
        '--json',
      ]);
      const previewPayload = JSON.parse(preview.stdout);

      expect(previewPayload.operationPlan.subjects).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^content-sha256:[a-f0-9]{64}$/),
          expect.stringMatching(/^content-length:\d+$/),
        ])
      );

      const humanPreview = await executeCli(['data', 'clean', filePath, '--output', outputPath]);
      expect(humanPreview.stdout).toContain('To write exactly this cleaned output, run:');
      expect(humanPreview.stdout).toContain('zw data clean');
      expect(humanPreview.stdout).toContain('--yes --plan-fingerprint');

      await writeFile(filePath, 'name,amount\nA,20\n', 'utf8');
      const staleConfirm = await executeCli([
        'data',
        'clean',
        filePath,
        '--output',
        outputPath,
        '--yes',
        '--plan-fingerprint',
        previewPayload.operationPlan.fingerprint,
        '--json',
      ]);

      expect(staleConfirm.exitCode).toBe(1);
      expect(JSON.parse(staleConfirm.stderr).error.code).toBe('OPERATION_PLAN_MISMATCH');
      await expect(readFile(outputPath, 'utf8')).rejects.toThrow();
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

  it('previews auto writeFile runs with explicit write targets', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const filePath = path.join(root, 'workflow.yml');
    const outputPath = path.join(root, 'report.txt');

    try {
      await writeFile(
        filePath,
        [
          'name: writer',
          'permissions:',
          '  fileWrites: prompt',
          'steps:',
          '  - name: save',
          '    writeFile:',
          '      path: report.txt',
          '      content: Hello',
          '',
        ].join('\n'),
        'utf8'
      );

      const result = await executeCli(['auto', 'run', filePath, '--json']);
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(payload).toMatchObject({
        status: 'preview',
        operationPlan: {
          risk: 'high',
          confirmationRequired: true,
          writes: [outputPath],
        },
      });
      expect(payload.operationPlan.subjects).toEqual(
        expect.arrayContaining([
          'step:save',
          'content-length:5',
          expect.stringMatching(/^content-sha256:[a-f0-9]{64}$/),
        ])
      );

      await writeFile(
        filePath,
        [
          'name: writer',
          'permissions:',
          '  fileWrites: prompt',
          'steps:',
          '  - name: save',
          '    writeFile:',
          '      path: report.txt',
          '      content: Changed',
          '',
        ].join('\n'),
        'utf8'
      );

      const mismatch = await executeCli([
        'auto',
        'run',
        filePath,
        '--yes',
        '--plan-fingerprint',
        payload.operationPlan.fingerprint,
        '--json',
      ]);
      expect(mismatch.exitCode).toBe(1);
      expect(JSON.parse(mismatch.stderr)).toMatchObject({
        error: {
          code: 'OPERATION_PLAN_MISMATCH',
        },
      });
      await expect(readFile(outputPath, 'utf8')).rejects.toThrow();

      const currentPreview = await executeCli(['auto', 'run', filePath, '--json']);
      const currentPlan = JSON.parse(currentPreview.stdout).operationPlan;
      const confirmed = await executeCli([
        'auto',
        'run',
        filePath,
        '--yes',
        '--plan-fingerprint',
        currentPlan.fingerprint,
        '--json',
      ]);
      expect(confirmed.exitCode).toBe(0);
      await expect(readFile(outputPath, 'utf8')).resolves.toBe('Changed');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('previews sensitive plugin and web commands by default', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const sourceDir = path.join(root, 'plugin source');

    try {
      await mkdir(sourceDir, { recursive: true });
      await writeFile(
        path.join(sourceDir, 'zaowu.plugin.json'),
        JSON.stringify({ schemaVersion: 1, id: 'local-tool' }),
        'utf8'
      );

      const plugin = await executeCli(['plugin', 'install', 'readme-gen', '--json'], { cwd: root });
      const pluginHuman = await executeCli(
        ['plugin', 'install', 'local-tool', '--source', sourceDir],
        {
          cwd: root,
        }
      );
      const web = await executeCli(['web', 'inspect', 'https://example.com', '--json']);
      const webHuman = await executeCli(['web', 'fetch', 'https://example.com']);

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
      expect(pluginHuman.stdout).toContain(`--source '${sourceDir}'`);
      if (path.sep === '\\') {
        expect(pluginHuman.stdout).not.toContain(sourceDir.replaceAll('\\', '\\\\'));
      }
      expect(webHuman.stdout).toContain('To fetch exactly this URL, run:');
      expect(webHuman.stdout).toContain(
        'zw web fetch https://example.com --yes --plan-fingerprint'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects stale plugin install confirmations when the target state changes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const pluginDir = path.join(root, '.zaowu', 'plugins');
    const pluginPath = path.join(pluginDir, 'readme-gen.json');

    try {
      const preview = await executeCli(['plugin', 'install', 'readme-gen', '--json'], {
        cwd: root,
      });
      const previewPayload = JSON.parse(preview.stdout);

      expect(previewPayload.operationPlan.subjects).toEqual(
        expect.arrayContaining(['target-state:missing'])
      );

      await mkdir(pluginDir, { recursive: true });
      await writeFile(pluginPath, '{"id":"readme-gen","source":"manual","installedAt":null}\n');

      const staleConfirm = await executeCli(
        [
          'plugin',
          'install',
          'readme-gen',
          '--yes',
          '--plan-fingerprint',
          previewPayload.operationPlan.fingerprint,
          '--json',
        ],
        { cwd: root }
      );

      expect(staleConfirm.exitCode).toBe(1);
      expect(JSON.parse(staleConfirm.stderr).error.code).toBe('OPERATION_PLAN_MISMATCH');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports unreadable plugin target state in operation plans', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const pluginPath = path.join(root, '.zaowu', 'plugins', 'readme-gen.json');

    try {
      await mkdir(pluginPath, { recursive: true });
      const preview = await executeCli(['plugin', 'install', 'readme-gen', '--json'], {
        cwd: root,
      });
      const previewPayload = JSON.parse(preview.stdout);

      expect(previewPayload.operationPlan.subjects).toEqual(
        expect.arrayContaining(['target-state:unreadable'])
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects stale plugin remove confirmations when the manifest changes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));
    const pluginPath = path.join(root, '.zaowu', 'plugins', 'readme-gen.json');

    try {
      await executeCli(['plugin', 'install', 'readme-gen', '--yes', '--json'], { cwd: root });
      const preview = await executeCli(['plugin', 'remove', 'readme-gen', '--json'], { cwd: root });
      const previewPayload = JSON.parse(preview.stdout);

      expect(previewPayload.operationPlan.subjects).toEqual(
        expect.arrayContaining([
          'target-state:exists',
          expect.stringMatching(/^target-content-sha256:[a-f0-9]{64}$/),
        ])
      );

      await writeFile(pluginPath, '{"id":"readme-gen","source":"changed","installedAt":null}\n');

      const staleConfirm = await executeCli(
        [
          'plugin',
          'remove',
          'readme-gen',
          '--yes',
          '--plan-fingerprint',
          previewPayload.operationPlan.fingerprint,
          '--json',
        ],
        { cwd: root }
      );

      expect(staleConfirm.exitCode).toBe(1);
      expect(JSON.parse(staleConfirm.stderr).error.code).toBe('OPERATION_PLAN_MISMATCH');
      await expect(readFile(pluginPath, 'utf8')).resolves.toContain('changed');
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

  it('previews init when --dry-run carries an = value alongside --yes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      const result = await executeCli(['init', '--yes', '--dry-run=1'], { cwd: root });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No files were written.');
      await expect(readFile(path.join(root, DEFAULT_CONFIG_FILE_NAME), 'utf8')).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('previews init when --yes appears after the end-of-options separator', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-cli-'));

    try {
      const result = await executeCli(['init', '--', '--yes'], { cwd: root });

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
        writes: [path.join(root, DEFAULT_CONFIG_FILE_NAME)],
        fingerprintAlgorithm: 'sha256-v1',
        fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(payload.operationPlan.subjects).toEqual(
        expect.arrayContaining([
          `init:${path.join(root, DEFAULT_CONFIG_FILE_NAME)}`,
          expect.stringMatching(/^content-sha256:[a-f0-9]{64}$/),
          expect.stringMatching(/^content-length:\d+$/),
        ])
      );
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
          writes: [path.join(root, DEFAULT_CONFIG_FILE_NAME)],
          fingerprintAlgorithm: 'sha256-v1',
          fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      });
      expect(payload.operationPlan.subjects).toEqual(
        expect.arrayContaining([
          `init:${path.join(root, DEFAULT_CONFIG_FILE_NAME)}`,
          expect.stringMatching(/^content-sha256:[a-f0-9]{64}$/),
          expect.stringMatching(/^content-length:\d+$/),
        ])
      );
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
