/* global console */
import { readFile } from 'node:fs/promises';
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

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});

const schemas = {
  autoValidate: await readJson('schemas', 'zaowu.command.auto-validate.schema.json'),
  autoPlan: await readJson('schemas', 'zaowu.command.auto-plan.schema.json'),
  autoRun: await readJson('schemas', 'zaowu.command.auto-run.schema.json'),
  devReview: await readJson('schemas', 'zaowu.command.dev-review.schema.json'),
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

const validators = {
  autoValidate: ajv.compile(schemas.autoValidate),
  autoPlan: ajv.compile(schemas.autoPlan),
  autoRun: ajv.compile(schemas.autoRun),
  devReview: ajv.compile(schemas.devReview),
};

const assertValid = (name, value) => {
  const validator = validators[name];

  assert(
    validator(value),
    `${name} JSON contract errors: ${ajv.errorsText(validator.errors, { separator: '; ' })}`
  );
};

const auto = await importBuiltPackage('auto');
const dev = await importBuiltPackage('dev');

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
assert(plan.sandbox?.shellCommands === 'blocked', 'auto sandbox must block shell commands.');
assert(
  !Object.hasOwn(plan.workflow.permissions, 'schemaVersion'),
  'workflow permissions must not be polluted with runtime schemaVersion.'
);
assert(plan.steps?.[0]?.policyDecision === 'allowed', 'auto plan steps must expose policy decisions.');
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

console.log('ZaoWu JSON contracts: ok');
