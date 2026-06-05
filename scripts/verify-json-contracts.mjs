/* global console */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const importBuiltPackage = async (packageName) =>
  import(pathToFileURL(path.join(root, 'packages', packageName, 'dist', 'index.js')).href);

const auto = await importBuiltPackage('auto');
const dev = await importBuiltPackage('dev');

const plan = auto.planWorkflowContent(
  'name: contract\nvars:\n  target: ZaoWu\nsteps:\n  - name: hello\n    message: Hello {{target}}\n'
);

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

console.log('ZaoWu JSON contracts: ok');
