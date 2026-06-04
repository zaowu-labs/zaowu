/* global console */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliEntry = path.join(root, 'packages', 'cli', 'dist', 'index.js');
const scratch = mkdtempSync(path.join(tmpdir(), 'zaowu-smoke-'));

const run = (args, options = {}) => {
  const output = execFileSync('node', [cliEntry, ...args], {
    cwd: options.cwd ?? scratch,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

  if (options.json) {
    return JSON.parse(output);
  }

  return output;
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

try {
  const version = run(['--version', '--json'], { json: true });
  assert(version.status === 'ok', 'version JSON should be ok');

  const initPreview = run(['init', '--json'], { json: true });
  assert(initPreview.status === 'ok', 'init preview should be ok');
  assert(initPreview.operationPlan?.writes?.length === 1, 'init should expose planned write');

  const init = run(['init', '--yes', '--json'], { json: true });
  assert(init.status === 'ok', 'confirmed init should be ok');

  const doctor = run(['doctor', '--json'], { json: true });
  assert(['ok', 'warning'].includes(doctor.status), 'doctor should return a known status');
  assert(doctor.operationPlan?.schemaVersion === 1, 'doctor should expose operation plan');

  const notePath = path.join(scratch, 'note.md');
  writeFileSync(notePath, '# Smoke\n\nZaoWu local smoke test.\n', 'utf8');

  const aiPreview = run(
    ['ai', 'ask', 'Summarize', '--file', notePath, '--provider', 'openai', '--json'],
    { json: true }
  );
  assert(aiPreview.status === 'preview', 'network AI should preview by default');
  assert(aiPreview.output === null, 'AI preview should not contain provider output');
  assert(aiPreview.input?.fileCharacters > 0, 'AI preview should read file input metadata');

  const docSummary = run(['doc', 'summary', notePath, '--json'], { json: true });
  assert(docSummary.title === 'Smoke', 'doc summary should read markdown title');

  const dataPath = path.join(scratch, 'data.csv');
  writeFileSync(dataPath, 'name,amount\nalpha,1\nbeta,2\n', 'utf8');
  const dataSchema = run(['data', 'schema', dataPath, '--json'], { json: true });
  assert(dataSchema.columns?.[1]?.type === 'number', 'data schema should infer numbers');

  const workflowPath = path.join(scratch, 'workflow.yml');
  writeFileSync(
    workflowPath,
    'name: smoke\nvars:\n  target: ZaoWu\nsteps:\n  - name: hello\n    message: Hello {{target}}\n',
    'utf8'
  );
  const autoPlan = run(['auto', 'plan', workflowPath, '--json'], { json: true });
  assert(autoPlan.steps?.[0]?.blocked === false, 'auto plan should mark message step ready');

  const pluginPreview = run(['plugin', 'install', 'smoke-plugin', '--json'], { json: true });
  assert(pluginPreview.status === 'preview', 'plugin install should preview by default');

  const webPreview = run(['web', 'inspect', 'https://example.com', '--json'], { json: true });
  assert(webPreview.status === 'preview', 'web inspect should preview by default');

  console.log('ZaoWu CLI smoke: ok');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
