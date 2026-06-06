/* global console, process */
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const importBuiltPackage = async (packageName) =>
  import(pathToFileURL(path.join(root, 'packages', packageName, 'dist', 'index.js')).href);
const readJson = async (...parts) => JSON.parse(await readFile(path.join(root, ...parts), 'utf8'));
const cliEntry = path.join(root, 'packages', 'cli', 'dist', 'index.js');

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});

const schemas = {
  shared: await readJson('schemas', 'zaowu.command.shared.schema.json'),
  aiAsk: await readJson('schemas', 'zaowu.command.ai-ask.schema.json'),
  aiProviders: await readJson('schemas', 'zaowu.command.ai-providers.schema.json'),
  autoValidate: await readJson('schemas', 'zaowu.command.auto-validate.schema.json'),
  autoPlan: await readJson('schemas', 'zaowu.command.auto-plan.schema.json'),
  autoRun: await readJson('schemas', 'zaowu.command.auto-run.schema.json'),
  config: await readJson('schemas', 'zaowu.config.schema.json'),
  configMigrate: await readJson('schemas', 'zaowu.command.config-migrate.schema.json'),
  configSet: await readJson('schemas', 'zaowu.command.config-set.schema.json'),
  configValidate: await readJson('schemas', 'zaowu.command.config-validate.schema.json'),
  devCommit: await readJson('schemas', 'zaowu.command.dev-commit.schema.json'),
  devReview: await readJson('schemas', 'zaowu.command.dev-review.schema.json'),
  devStatus: await readJson('schemas', 'zaowu.command.dev-status.schema.json'),
  doctor: await readJson('schemas', 'zaowu.command.doctor.schema.json'),
  error: await readJson('schemas', 'zaowu.command.error.schema.json'),
  init: await readJson('schemas', 'zaowu.command.init.schema.json'),
};

for (const [name, schema] of Object.entries(schemas)) {
  assert(
    schema.$schema === 'https://json-schema.org/draft/2020-12/schema',
    `${name} schema should use draft 2020-12.`
  );
  assert(
    typeof schema.$id === 'string' && schema.$id.startsWith('https://schemas.zaowu.dev/'),
    `${name} schema should use the ZaoWu schema id namespace.`
  );
  assert(ajv.validateSchema(schema), `${name} schema should be a valid JSON Schema.`);
}

ajv.addSchema(schemas.shared);
ajv.addSchema(schemas.config);

const validators = {
  aiAsk: ajv.compile(schemas.aiAsk),
  aiProviders: ajv.compile(schemas.aiProviders),
  autoValidate: ajv.compile(schemas.autoValidate),
  autoPlan: ajv.compile(schemas.autoPlan),
  autoRun: ajv.compile(schemas.autoRun),
  configMigrate: ajv.compile(schemas.configMigrate),
  configSet: ajv.compile(schemas.configSet),
  configValidate: ajv.compile(schemas.configValidate),
  devCommit: ajv.compile(schemas.devCommit),
  devReview: ajv.compile(schemas.devReview),
  devStatus: ajv.compile(schemas.devStatus),
  doctor: ajv.compile(schemas.doctor),
  error: ajv.compile(schemas.error),
  init: ajv.compile(schemas.init),
};

const assertValid = (name, value) => {
  const validator = validators[name];

  assert(
    validator(value),
    `${name} JSON contract errors: ${ajv.errorsText(validator.errors, { separator: '; ' })}`
  );
};

const assertJsonEqual = (left, right, message) => {
  assert(JSON.stringify(left) === JSON.stringify(right), message);
};

const assertSchemaFragmentsStayAligned = () => {
  const ref = (definitionName) =>
    `https://schemas.zaowu.dev/zaowu.command.shared.schema.json#/$defs/${definitionName}`;

  assertJsonEqual(
    schemas.aiAsk.properties.provider,
    { $ref: ref('aiProviderDescriptor') },
    'ai ask provider schema must reference the shared aiProviderDescriptor fragment.'
  );
  assertJsonEqual(
    schemas.aiAsk.properties.input,
    { $ref: ref('aiInput') },
    'ai ask input schema must reference the shared aiInput fragment.'
  );
  assertJsonEqual(
    schemas.aiAsk.properties.validation,
    { $ref: ref('aiProviderValidation') },
    'ai ask validation schema must reference the shared aiProviderValidation fragment.'
  );
  assertJsonEqual(
    schemas.aiProviders.properties.providers.items,
    { $ref: ref('aiProviderDescriptor') },
    'ai providers entries must reference the shared aiProviderDescriptor fragment.'
  );
  assertJsonEqual(
    schemas.aiProviders.properties.validation,
    { $ref: ref('aiProviderValidation') },
    'ai providers validation schema must reference the shared aiProviderValidation fragment.'
  );
  assertJsonEqual(
    schemas.autoPlan.properties.policy,
    { $ref: ref('autoPolicy') },
    'auto plan policy schema must reference the shared autoPolicy fragment.'
  );
  assertJsonEqual(
    schemas.autoRun.properties.policy,
    { $ref: ref('autoPolicy') },
    'auto run policy schema must reference the shared autoPolicy fragment.'
  );
  assertJsonEqual(
    schemas.autoValidate.properties.policy,
    { $ref: ref('autoPolicy') },
    'auto validate policy schema must reference the shared autoPolicy fragment.'
  );
  assertJsonEqual(
    schemas.autoPlan.properties.sandbox,
    { $ref: ref('autoSandbox') },
    'auto plan sandbox schema must reference the shared autoSandbox fragment.'
  );
  assertJsonEqual(
    schemas.autoRun.properties.sandbox,
    { $ref: ref('autoSandbox') },
    'auto run sandbox schema must reference the shared autoSandbox fragment.'
  );
  assertJsonEqual(
    schemas.autoValidate.properties.sandbox,
    { $ref: ref('autoSandbox') },
    'auto validate sandbox schema must reference the shared autoSandbox fragment.'
  );
  assertJsonEqual(
    schemas.aiAsk.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'ai ask operationPlan schema must reference the shared operationPlan fragment.'
  );
  assertJsonEqual(
    schemas.autoRun.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'auto run operationPlan schema must reference the shared operationPlan fragment.'
  );
  assertJsonEqual(
    schemas.devCommit.properties.summary,
    { $ref: ref('devChangeSummary') },
    'dev commit summary schema must reference the shared devChangeSummary fragment.'
  );
  assertJsonEqual(
    schemas.devReview.properties.summary,
    { $ref: ref('devChangeSummary') },
    'dev review summary schema must reference the shared devChangeSummary fragment.'
  );
  assertJsonEqual(
    schemas.devCommit.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'dev commit operationPlan schema must reference the shared operationPlan fragment.'
  );
  assertJsonEqual(
    schemas.devReview.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'dev review operationPlan schema must reference the shared operationPlan fragment.'
  );
  assertJsonEqual(
    schemas.devStatus.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'dev status operationPlan schema must reference the shared operationPlan fragment.'
  );
  assertJsonEqual(
    schemas.doctor.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'doctor operationPlan schema must reference the shared operationPlan fragment.'
  );
  assertJsonEqual(
    schemas.init.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'init operationPlan schema must reference the shared operationPlan fragment.'
  );
  assertJsonEqual(
    schemas.configSet.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'config set operationPlan schema must reference the shared operationPlan fragment.'
  );
  assertJsonEqual(
    schemas.configMigrate.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'config migrate operationPlan schema must reference the shared operationPlan fragment.'
  );
  assertJsonEqual(
    schemas.autoPlan.properties.steps.items.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'auto plan step operationPlan schema must reference the shared operationPlan fragment.'
  );
};

const runProcess = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw new Error(`${command} ${args.join(' ')} could not start: ${result.error.message}`);
  }

  assert(
    result.status === 0,
    `${command} ${args.join(' ')} failed with exit ${result.status}: ${result.stderr || result.stdout}`
  );

  return result;
};

const runProcessRaw = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw new Error(`${command} ${args.join(' ')} could not start: ${result.error.message}`);
  }

  return result;
};

const runCliJson = (args, options = {}) => {
  const result = runProcess(process.execPath, [cliEntry, ...args, '--json'], options);
  const stderr = result.stderr.trim();

  assert(stderr.length === 0, `zw ${args.join(' ')} --json should not write stderr: ${stderr}`);

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`zw ${args.join(' ')} --json did not return valid JSON: ${error.message}`);
  }
};

const runCliErrorJson = (args, expectedCode, options = {}) => {
  const result = runProcessRaw(process.execPath, [cliEntry, ...args, '--json'], options);

  assert(
    typeof result.status === 'number' && result.status !== 0,
    `zw ${args.join(' ')} --json should fail for the expected error contract.`
  );
  assert(
    result.stdout.trim().length === 0,
    `zw ${args.join(' ')} --json should not write stdout on expected errors: ${result.stdout}`
  );

  let parsed;

  try {
    parsed = JSON.parse(result.stderr);
  } catch (error) {
    throw new Error(
      `zw ${args.join(' ')} --json did not return valid error JSON on stderr: ${error.message}`
    );
  }

  assertValid('error', parsed);
  assert(
    parsed.error.code === expectedCode,
    `zw ${args.join(' ')} --json should fail with ${expectedCode}, got ${parsed.error.code}.`
  );

  return parsed;
};

const runGit = (cwd, args) => {
  runProcess('git', args, { cwd });
};

const createDevReviewCliFixture = async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'zaowu-dev-review-contract-'));
  const sourceDir = path.join(fixtureRoot, 'packages', 'dev', 'src');
  const sourceFile = path.join(sourceDir, 'index.ts');

  try {
    runGit(fixtureRoot, ['init', '--quiet']);
    await mkdir(sourceDir, { recursive: true });
    await writeFile(
      sourceFile,
      [
        'import { execFileSync } from "node:child_process";',
        '',
        'execFileSync("git", ["status"]);',
        '',
      ].join('\n')
    );
    runGit(fixtureRoot, ['add', 'packages/dev/src/index.ts']);

    return fixtureRoot;
  } catch (error) {
    await rm(fixtureRoot, { force: true, recursive: true });
    throw error;
  }
};

const core = await importBuiltPackage('core');
const ai = await importBuiltPackage('ai');
const auto = await importBuiltPackage('auto');
const configPackage = await importBuiltPackage('config');
const dev = await importBuiltPackage('dev');

assertSchemaFragmentsStayAligned();

const schemaErrorCodes = schemas.error.properties.error.properties.code.enum;
assert(
  JSON.stringify([...schemaErrorCodes].sort()) === JSON.stringify([...core.ZAOWU_ERROR_CODES].sort()),
  'Command error schema code enum must match the core error code registry.'
);

const localAIAsk = await ai.askAI({ prompt: 'Explain ZaoWu' });
const aiProviders = {
  schemaVersion: 1,
  status: 'ok',
  providers: ai.listAIProviders({}),
};

assert(localAIAsk.schemaVersion === 1, 'ai ask result schemaVersion must be 1.');
assert(localAIAsk.status === 'ok', 'ai ask local provider output should be ok.');
assertValid('aiAsk', localAIAsk);
assertValid('aiProviders', aiProviders);

const workflowContent =
  'name: contract\nvars:\n  target: ZaoWu\nsteps:\n  - name: hello\n    message: Hello {{target}}\n';
const validation = auto.validateWorkflowContent(workflowContent);
const plan = auto.planWorkflowContent(workflowContent);
const run = await auto.runWorkflowFile(path.join(root, 'examples', 'workflows', 'message.yml'));

assert(validation.schemaVersion === 1, 'auto validation result schemaVersion must be 1.');
assertValid('autoValidate', validation);
assert(plan.schemaVersion === 1, 'auto plan result schemaVersion must be 1.');
assert(plan.policy?.schemaVersion === 1, 'auto plan policy schemaVersion must be 1.');
assert(plan.policy?.shell === 'blocked', 'auto plan policy must expose shell mode.');
assert(plan.sandbox?.schemaVersion === 1, 'auto plan sandbox schemaVersion must be 1.');
assert(
  path.isAbsolute(plan.sandbox?.workflowDirectory ?? ''),
  'auto plan sandbox must expose an absolute workflowDirectory.'
);
assert(plan.sandbox?.shellCommands === 'blocked', 'auto sandbox must block shell commands.');
assert(
  !Object.hasOwn(plan.workflow.permissions, 'schemaVersion'),
  'workflow permissions must not be polluted with runtime schemaVersion.'
);
assert(plan.steps?.[0]?.policyDecision === 'allowed', 'auto plan steps must expose policy decisions.');
assert(
  plan.steps?.[0]?.operationPlan?.risk === 'low',
  'auto plan message steps must expose low-risk step operation plans.'
);
assert(
  plan.steps?.[0]?.operationPlan?.executes?.length === 0,
  'auto plan message steps must not report shell execution.'
);
assertValid('autoPlan', plan);
assert(run.schemaVersion === 1, 'auto run result schemaVersion must be 1.');
assert(run.status === 'preview', 'auto run should preview by default.');
assertValid('autoRun', run);

const configValidateFixture = await mkdtemp(path.join(tmpdir(), 'zaowu-config-validate-contract-'));

try {
  await writeFile(
    path.join(configValidateFixture, 'zw.yml'),
    [
      'version: 1',
      '',
      'project:',
      '  name: contract',
      '',
      'ai:',
      '  provider: echo',
      '',
      'defaults:',
      '  output: human',
      '',
      'paths:',
      '  workspace: .',
      '  cache: .zaowu/cache',
      '',
    ].join('\n')
  );

  const configValidation = await configPackage.validateResolvedConfig(configValidateFixture);
  const configSet = await configPackage.setResolvedConfigValue(
    'project.name',
    'contract-next',
    {
      cwd: configValidateFixture,
    }
  );
  const configMigration = await configPackage.migrateResolvedConfig({
    cwd: configValidateFixture,
  });

  assert(
    configValidation.schemaVersion === 1,
    'config validate result schemaVersion must be 1.'
  );
  assertValid('configValidate', configValidation);
  assert(configSet.schemaVersion === 1, 'config set result schemaVersion must be 1.');
  assert(configSet.status === 'preview', 'config set package output should preview by default.');
  assertValid('configSet', configSet);
  assert(configMigration.schemaVersion === 1, 'config migrate result schemaVersion must be 1.');
  assertValid('configMigrate', configMigration);
} finally {
  await rm(configValidateFixture, { force: true, recursive: true });
}

const runner = (_command, args) => {
  const key = args.join(' ');

  if (key === 'diff --cached --name-only') {
    return 'packages/dev/src/index.ts';
  }

  if (key === 'diff --cached --numstat') {
    return '2\t1\tpackages/dev/src/index.ts';
  }

  if (key === 'diff --cached --unified=0') {
    return [
      'diff --git a/packages/dev/src/index.ts b/packages/dev/src/index.ts',
      '@@ -1 +1,2 @@',
      '-old',
      '+new',
      '+execFileSync("git", ["status"])',
    ].join('\n');
  }

  if (key === 'status --short --branch') {
    return '## main\nM  packages/dev/src/index.ts';
  }

  throw new Error(`Unexpected git command: ${key}`);
};

const commit = dev.previewDevCommit(runner);
const review = dev.reviewDevChanges(runner, { mode: 'staged' });
const status = dev.getDevStatus(runner);

assert(commit.schemaVersion === 1, 'dev commit result schemaVersion must be 1.');
assert(commit.source === 'staged', 'dev commit should use staged changes.');
assertValid('devCommit', commit);
assert(review.schemaVersion === 1, 'dev review result schemaVersion must be 1.');
assert(Array.isArray(review.diffHunks), 'dev review diffHunks must be an array.');
assert(review.diffHunks[0]?.addedLines === 2, 'dev review diffHunks must expose added lines.');
assert(
  review.findings.some((finding) => finding.title === 'Shell execution added'),
  'dev review must expose deterministic shell-execution risk findings.'
);
assertValid('devReview', review);
assert(status.schemaVersion === 1, 'dev status result schemaVersion must be 1.');
assert(status.clean === false, 'dev status should report staged changes.');
assertValid('devStatus', status);

const cliWorkflowPath = 'examples/workflows/message.yml';
const cliInitFixture = await mkdtemp(path.join(tmpdir(), 'zaowu-init-contract-'));
const cliDoctor = runCliJson(['doctor']);
const cliAIProviders = runCliJson(['ai', 'providers']);
const cliAIAsk = runCliJson(['ai', 'ask', 'Explain', 'ZaoWu']);
const cliAIPreview = runCliJson([
  'ai',
  'ask',
  'Summarize',
  '--file',
  'examples/docs/report.md',
  '--provider',
  'openai',
]);
const cliValidation = runCliJson(['auto', 'validate', cliWorkflowPath]);
const cliPlan = runCliJson(['auto', 'plan', cliWorkflowPath]);
const cliRun = runCliJson(['auto', 'run', cliWorkflowPath]);

try {
  const cliInitPreview = runCliJson(['init'], { cwd: cliInitFixture });
  const cliInitCreated = runCliJson(['init', '--yes'], { cwd: cliInitFixture });
  const cliConfigValidation = runCliJson(['config', 'validate'], { cwd: cliInitFixture });
  const cliConfigSet = runCliJson(['config', 'set', 'project.name', 'contract-cli'], {
    cwd: cliInitFixture,
  });
  const cliConfigMigration = runCliJson(['config', 'migrate'], { cwd: cliInitFixture });

  assertValid('init', cliInitPreview);
  assertValid('init', cliInitCreated);
  assertValid('configSet', cliConfigSet);
  assertValid('configMigrate', cliConfigMigration);
  assertValid('configValidate', cliConfigValidation);
  assert(cliInitPreview.schemaVersion === 1, 'CLI init preview schemaVersion must be 1.');
  assert(cliInitPreview.dryRun === true, 'CLI init preview should report dryRun true.');
  assert(
    cliInitPreview.operationPlan?.confirmationRequired === true,
    'CLI init preview should require confirmation.'
  );
  assert(cliInitCreated.schemaVersion === 1, 'CLI init created schemaVersion must be 1.');
  assert(
    cliInitCreated.operationPlan?.confirmationRequired === false,
    'CLI init created output should not require further confirmation.'
  );
  assert(
    cliConfigValidation.schemaVersion === 1,
    'CLI config validate schemaVersion must be 1.'
  );
  assert(cliConfigValidation.status === 'ok', 'CLI config validate should be ok after init.');
  assert(cliConfigSet.schemaVersion === 1, 'CLI config set schemaVersion must be 1.');
  assert(
    cliConfigSet.operationPlan?.confirmationRequired === true,
    'CLI config set preview should require confirmation.'
  );
  assert(cliConfigMigration.schemaVersion === 1, 'CLI config migrate schemaVersion must be 1.');
  assert(
    cliConfigMigration.operationPlan?.confirmationRequired === false,
    'CLI config migrate unchanged output should not require confirmation.'
  );
} finally {
  await rm(cliInitFixture, { force: true, recursive: true });
}

assertValid('doctor', cliDoctor);
assertValid('aiProviders', cliAIProviders);
assertValid('aiAsk', cliAIAsk);
assertValid('aiAsk', cliAIPreview);
assert(cliDoctor.schemaVersion === 1, 'CLI doctor result schemaVersion must be 1.');
assert(cliDoctor.operationPlan?.risk === 'low', 'CLI doctor should expose low-risk diagnostics.');
assert(cliAIProviders.schemaVersion === 1, 'CLI ai providers schemaVersion must be 1.');
assert(
  cliAIProviders.providers.some((provider) => provider.id === 'openai'),
  'CLI ai providers should expose the OpenAI provider.'
);
assert(cliAIAsk.schemaVersion === 1, 'CLI ai ask schemaVersion must be 1.');
assert(cliAIAsk.status === 'ok', 'CLI local ai ask should be ok.');
assert(
  cliAIAsk.operationPlan?.network?.length === 0,
  'CLI local ai ask should not report network access.'
);
assert(cliAIPreview.status === 'preview', 'CLI network ai ask should preview by default.');
assert(cliAIPreview.output === null, 'CLI network ai preview should not expose provider output.');
assert(
  cliAIPreview.operationPlan?.confirmationRequired === true,
  'CLI network ai preview should require confirmation.'
);
assert(
  cliDoctor.operationPlan?.executes?.includes('corepack pnpm --version'),
  'CLI doctor operation plan should disclose the Corepack pnpm check.'
);
assert(
  ['Node.js', 'Git', 'pnpm', 'Config'].every((name) =>
    cliDoctor.checks.some((check) => check.name === name)
  ),
  'CLI doctor should expose Node.js, Git, pnpm, and Config checks.'
);
assertValid('autoValidate', cliValidation);
assertValid('autoPlan', cliPlan);
assertValid('autoRun', cliRun);
assert(cliRun.status === 'preview', 'CLI auto run should preview by default.');

const devReviewCliFixture = await createDevReviewCliFixture();

try {
  const cliStatus = runCliJson(['dev', 'status'], { cwd: devReviewCliFixture });
  const cliCommit = runCliJson(['dev', 'commit'], { cwd: devReviewCliFixture });
  const cliReview = runCliJson(['dev', 'review', '--staged'], { cwd: devReviewCliFixture });

  assertValid('devStatus', cliStatus);
  assertValid('devCommit', cliCommit);
  assertValid('devReview', cliReview);
  assert(cliStatus.schemaVersion === 1, 'CLI dev status schemaVersion must be 1.');
  assert(
    cliStatus.operationPlan?.executes?.includes('git status --short --branch'),
    'CLI dev status operation plan should disclose git status.'
  );
  assert(cliCommit.schemaVersion === 1, 'CLI dev commit schemaVersion must be 1.');
  assert(
    cliCommit.operationPlan?.reads?.includes('staged git diff'),
    'CLI dev commit operation plan should disclose staged diff reads.'
  );
  assert(
    cliReview.summary.files.includes('packages/dev/src/index.ts'),
    'CLI dev review should expose staged fixture files.'
  );
  assert(
    cliReview.findings.some((finding) => finding.title === 'Shell execution added'),
    'CLI dev review should expose deterministic shell-execution findings.'
  );
} finally {
  await rm(devReviewCliFixture, { force: true, recursive: true });
}

runCliErrorJson(['auto', 'plan'], 'TARGET_REQUIRED');
runCliErrorJson(['unknown-command'], 'UNKNOWN_COMMAND');
runCliErrorJson(['web', 'inspect', 'not-a-url'], 'WEB_URL_INVALID');
runCliErrorJson(['ai', 'ask'], 'AI_PROMPT_REQUIRED');
runCliErrorJson(['ai', 'providers', '--provider', 'missing'], 'AI_PROVIDER_NOT_FOUND');
runCliErrorJson(['ai', 'ask', 'Explain', 'ZaoWu', '--provider', 'missing'], 'AI_PROVIDER_NOT_FOUND');
runCliErrorJson(['ai', 'ask', 'Explain', 'ZaoWu', '--provider', 'openai', '--yes'], 'AI_PROVIDER_CONFIG_MISSING', {
  env: {
    ...process.env,
    OPENAI_API_KEY: '',
  },
});

const emptyDevCliFixture = await mkdtemp(path.join(tmpdir(), 'zaowu-dev-empty-contract-'));

try {
  runGit(emptyDevCliFixture, ['init', '--quiet']);
  runCliErrorJson(['dev', 'commit'], 'NO_STAGED_CHANGES', { cwd: emptyDevCliFixture });
  runCliErrorJson(['dev', 'review', '--staged'], 'NO_CHANGES_TO_REVIEW', {
    cwd: emptyDevCliFixture,
  });
} finally {
  await rm(emptyDevCliFixture, { force: true, recursive: true });
}

console.log('ZaoWu JSON contracts: ok');
