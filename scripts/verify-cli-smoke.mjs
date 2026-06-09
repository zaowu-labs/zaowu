/* global console */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliEntry = path.join(root, 'packages', 'cli', 'dist', 'index.js');
const scratch = mkdtempSync(path.join(tmpdir(), 'zaowu-smoke-'));
const examples = path.join(root, 'examples');

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
  assert(version.schemaVersion === 1, 'version JSON should expose result schema version');
  assert(version.status === 'ok', 'version JSON should be ok');

  const initPreview = run(['init', '--json'], { json: true });
  assert(initPreview.schemaVersion === 1, 'init preview should expose result schema version');
  assert(initPreview.status === 'ok', 'init preview should be ok');
  assert(initPreview.operationPlan?.writes?.length === 1, 'init should expose planned write');
  assert(
    /^[a-f0-9]{64}$/.test(initPreview.operationPlan?.fingerprint ?? ''),
    'init preview should expose a stable operation plan fingerprint'
  );

  const init = run(
    ['init', '--yes', '--plan-fingerprint', initPreview.operationPlan.fingerprint, '--json'],
    { json: true }
  );
  assert(init.schemaVersion === 1, 'confirmed init should expose result schema version');
  assert(init.status === 'ok', 'confirmed init should be ok');
  assert(
    init.operationPlan?.fingerprint === initPreview.operationPlan.fingerprint,
    'confirmed init should preserve the preview operation plan fingerprint'
  );

  const configValidation = run(['config', 'validate', '--json'], { json: true });
  assert(
    configValidation.schemaVersion === 1,
    'config validate should expose result schema version'
  );
  assert(configValidation.status === 'ok', 'config validate should be ok after init');

  const configPath = run(['config', 'path', '--json'], { json: true });
  assert(configPath.schemaVersion === 1, 'config path should expose result schema version');

  const configShow = run(['config', 'show', '--json'], { json: true });
  assert(configShow.schemaVersion === 1, 'config show should expose result schema version');

  const configGet = run(['config', 'get', 'project.name', '--json'], { json: true });
  assert(configGet.schemaVersion === 1, 'config get should expose result schema version');

  const configSet = run(['config', 'set', 'project.name', 'smoke-project', '--json'], {
    json: true,
  });
  assert(configSet.schemaVersion === 1, 'config set should expose result schema version');
  assert(configSet.status === 'preview', 'config set should preview by default');

  const configMigrate = run(['config', 'migrate', '--json'], { json: true });
  assert(configMigrate.schemaVersion === 1, 'config migrate should expose result schema version');
  assert(configMigrate.status === 'ok', 'config migrate should be ok for canonical config');

  const doctor = run(['doctor', '--json'], { json: true });
  assert(['ok', 'warning'].includes(doctor.status), 'doctor should return a known status');
  assert(doctor.operationPlan?.schemaVersion === 1, 'doctor should expose operation plan');

  const notePath = path.join(examples, 'docs', 'report.md');

  const aiProviders = run(['ai', 'providers', '--json'], { json: true });
  assert(aiProviders.schemaVersion === 1, 'ai providers should expose result schema version');
  assert(
    aiProviders.providers?.some((provider) => provider.id === 'openai'),
    'ai providers should list openai'
  );

  const aiLocal = run(['ai', 'ask', 'Explain', 'ZaoWu', '--json'], { json: true });
  assert(aiLocal.schemaVersion === 1, 'local AI ask should expose result schema version');
  assert(aiLocal.status === 'ok', 'local AI ask should be ok');

  const aiPreview = run(
    ['ai', 'ask', 'Summarize', '--file', notePath, '--provider', 'openai', '--json'],
    { json: true }
  );
  assert(aiPreview.schemaVersion === 1, 'network AI preview should expose result schema version');
  assert(aiPreview.status === 'preview', 'network AI should preview by default');
  assert(aiPreview.output === null, 'AI preview should not contain provider output');
  assert(aiPreview.input?.fileCharacters > 0, 'AI preview should read file input metadata');

  const devRoot = path.join(scratch, 'dev-fixture');
  mkdirSync(path.join(devRoot, 'packages', 'dev', 'src'), { recursive: true });
  execFileSync('git', ['init', '--quiet'], { cwd: devRoot, stdio: 'ignore' });
  writeFileSync(path.join(devRoot, 'packages', 'dev', 'src', 'index.ts'), 'export const x = 1;\n');
  execFileSync('git', ['add', 'packages/dev/src/index.ts'], { cwd: devRoot, stdio: 'ignore' });

  const devStatus = run(['dev', 'status', '--json'], { cwd: devRoot, json: true });
  assert(devStatus.schemaVersion === 1, 'dev status should expose result schema version');
  assert(devStatus.clean === false, 'dev status should report staged changes');

  const devCommit = run(['dev', 'commit', '--json'], { cwd: devRoot, json: true });
  assert(devCommit.schemaVersion === 1, 'dev commit should expose result schema version');
  assert(devCommit.source === 'staged', 'dev commit should read staged changes');
  assert(devCommit.suggestion?.title === devCommit.message, 'dev commit should expose suggestion');
  assert(Array.isArray(devCommit.findings), 'dev commit should expose findings');

  const docSummary = run(['doc', 'summary', notePath, '--json'], { json: true });
  assert(docSummary.schemaVersion === 1, 'doc summary should expose result schema version');
  assert(docSummary.title === 'Smoke Report', 'doc summary should read markdown title');

  const dataPath = path.join(examples, 'data', 'sales.csv');
  const dataSchema = run(['data', 'schema', dataPath, '--json'], { json: true });
  assert(dataSchema.schemaVersion === 1, 'data schema should expose result schema version');
  assert(dataSchema.columns?.[1]?.type === 'number', 'data schema should infer numbers');

  const workflowPath = path.join(examples, 'workflows', 'message.yml');
  const autoPlan = run(['auto', 'plan', workflowPath, '--json'], { json: true });
  assert(autoPlan.schemaVersion === 1, 'auto plan should expose result schema version');
  assert(autoPlan.policy?.schemaVersion === 1, 'auto plan should expose policy schema version');
  assert(autoPlan.sandbox?.schemaVersion === 1, 'auto plan should expose sandbox schema version');
  assert(autoPlan.sandbox?.shellCommands === 'blocked', 'auto sandbox should block shell commands');
  assert(autoPlan.steps?.[0]?.blocked === false, 'auto plan should mark message step ready');

  const pluginManifestPath = path.join(examples, 'plugins', 'hello');
  const pluginValidation = run(['plugin', 'validate', pluginManifestPath, '--json'], {
    json: true,
  });
  assert(
    pluginValidation.schemaVersion === 1,
    'plugin validate should expose result schema version'
  );
  assert(pluginValidation.status === 'ok', 'example plugin manifest should validate');

  const pluginPreview = run(['plugin', 'install', 'smoke-plugin', '--json'], { json: true });
  assert(pluginPreview.schemaVersion === 1, 'plugin install should expose result schema version');
  assert(pluginPreview.status === 'preview', 'plugin install should preview by default');

  const teachPlan = run(['teach', 'plan', 'TypeScript basics', '--json'], { json: true });
  assert(teachPlan.schemaVersion === 1, 'teach plan should expose result schema version');

  const webPreview = run(['web', 'inspect', 'https://example.com', '--json'], { json: true });
  assert(webPreview.schemaVersion === 1, 'web inspect should expose result schema version');
  assert(webPreview.status === 'preview', 'web inspect should preview by default');

  console.log('ZaoWu CLI smoke: ok');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
