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
  autoValidate: await readJson('schemas', 'zaowu.command.auto-validate.schema.json'),
  autoPlan: await readJson('schemas', 'zaowu.command.auto-plan.schema.json'),
  autoRun: await readJson('schemas', 'zaowu.command.auto-run.schema.json'),
  devReview: await readJson('schemas', 'zaowu.command.dev-review.schema.json'),
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

const validators = {
  autoValidate: ajv.compile(schemas.autoValidate),
  autoPlan: ajv.compile(schemas.autoPlan),
  autoRun: ajv.compile(schemas.autoRun),
  devReview: ajv.compile(schemas.devReview),
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
    schemas.autoRun.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'auto run operationPlan schema must reference the shared operationPlan fragment.'
  );
  assertJsonEqual(
    schemas.devReview.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'dev review operationPlan schema must reference the shared operationPlan fragment.'
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
const auto = await importBuiltPackage('auto');
const dev = await importBuiltPackage('dev');

assertSchemaFragmentsStayAligned();

const schemaErrorCodes = schemas.error.properties.error.properties.code.enum;
assert(
  JSON.stringify([...schemaErrorCodes].sort()) === JSON.stringify([...core.ZAOWU_ERROR_CODES].sort()),
  'Command error schema code enum must match the core error code registry.'
);

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

  throw new Error(`Unexpected git command: ${key}`);
};

const review = dev.reviewDevChanges(runner, { mode: 'staged' });

assert(review.schemaVersion === 1, 'dev review result schemaVersion must be 1.');
assert(Array.isArray(review.diffHunks), 'dev review diffHunks must be an array.');
assert(review.diffHunks[0]?.addedLines === 2, 'dev review diffHunks must expose added lines.');
assert(
  review.findings.some((finding) => finding.title === 'Shell execution added'),
  'dev review must expose deterministic shell-execution risk findings.'
);
assertValid('devReview', review);

const cliWorkflowPath = 'examples/workflows/message.yml';
const cliInitFixture = await mkdtemp(path.join(tmpdir(), 'zaowu-init-contract-'));
const cliDoctor = runCliJson(['doctor']);
const cliValidation = runCliJson(['auto', 'validate', cliWorkflowPath]);
const cliPlan = runCliJson(['auto', 'plan', cliWorkflowPath]);
const cliRun = runCliJson(['auto', 'run', cliWorkflowPath]);

try {
  const cliInitPreview = runCliJson(['init'], { cwd: cliInitFixture });
  const cliInitCreated = runCliJson(['init', '--yes'], { cwd: cliInitFixture });

  assertValid('init', cliInitPreview);
  assertValid('init', cliInitCreated);
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
} finally {
  await rm(cliInitFixture, { force: true, recursive: true });
}

assertValid('doctor', cliDoctor);
assert(cliDoctor.schemaVersion === 1, 'CLI doctor result schemaVersion must be 1.');
assert(cliDoctor.operationPlan?.risk === 'low', 'CLI doctor should expose low-risk diagnostics.');
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
  const cliReview = runCliJson(['dev', 'review', '--staged'], { cwd: devReviewCliFixture });

  assertValid('devReview', cliReview);
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
runCliErrorJson(['ai', 'ask', 'Explain', 'ZaoWu', '--provider', 'missing'], 'AI_PROVIDER_NOT_FOUND');
runCliErrorJson(['ai', 'ask', 'Explain', 'ZaoWu', '--provider', 'openai', '--yes'], 'AI_PROVIDER_CONFIG_MISSING', {
  env: {
    ...process.env,
    OPENAI_API_KEY: '',
  },
});

console.log('ZaoWu JSON contracts: ok');
