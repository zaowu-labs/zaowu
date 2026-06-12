/* global console, process */
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
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
  configGet: await readJson('schemas', 'zaowu.command.config-get.schema.json'),
  configMigrate: await readJson('schemas', 'zaowu.command.config-migrate.schema.json'),
  configPath: await readJson('schemas', 'zaowu.command.config-path.schema.json'),
  configSet: await readJson('schemas', 'zaowu.command.config-set.schema.json'),
  configShow: await readJson('schemas', 'zaowu.command.config-show.schema.json'),
  configValidate: await readJson('schemas', 'zaowu.command.config-validate.schema.json'),
  dataAnalyze: await readJson('schemas', 'zaowu.command.data-analyze.schema.json'),
  dataClean: await readJson('schemas', 'zaowu.command.data-clean.schema.json'),
  dataInspect: await readJson('schemas', 'zaowu.command.data-inspect.schema.json'),
  dataSample: await readJson('schemas', 'zaowu.command.data-sample.schema.json'),
  dataSchema: await readJson('schemas', 'zaowu.command.data-schema.schema.json'),
  dataSheets: await readJson('schemas', 'zaowu.command.data-sheets.schema.json'),
  devCommit: await readJson('schemas', 'zaowu.command.dev-commit.schema.json'),
  devReview: await readJson('schemas', 'zaowu.command.dev-review.schema.json'),
  devStatus: await readJson('schemas', 'zaowu.command.dev-status.schema.json'),
  devSync: await readJson('schemas', 'zaowu.command.dev-sync.schema.json'),
  docConvert: await readJson('schemas', 'zaowu.command.doc-convert.schema.json'),
  docExtract: await readJson('schemas', 'zaowu.command.doc-extract.schema.json'),
  docOutline: await readJson('schemas', 'zaowu.command.doc-outline.schema.json'),
  docSearch: await readJson('schemas', 'zaowu.command.doc-search.schema.json'),
  docSummary: await readJson('schemas', 'zaowu.command.doc-summary.schema.json'),
  doctor: await readJson('schemas', 'zaowu.command.doctor.schema.json'),
  error: await readJson('schemas', 'zaowu.command.error.schema.json'),
  help: await readJson('schemas', 'zaowu.command.help.schema.json'),
  init: await readJson('schemas', 'zaowu.command.init.schema.json'),
  plugin: await readJson('schemas', 'zaowu.plugin.schema.json'),
  pluginInstall: await readJson('schemas', 'zaowu.command.plugin-install.schema.json'),
  pluginList: await readJson('schemas', 'zaowu.command.plugin-list.schema.json'),
  pluginRemove: await readJson('schemas', 'zaowu.command.plugin-remove.schema.json'),
  pluginValidate: await readJson('schemas', 'zaowu.command.plugin-validate.schema.json'),
  teachPlan: await readJson('schemas', 'zaowu.command.teach-plan.schema.json'),
  teachQuiz: await readJson('schemas', 'zaowu.command.teach-quiz.schema.json'),
  version: await readJson('schemas', 'zaowu.command.version.schema.json'),
  webFetch: await readJson('schemas', 'zaowu.command.web-fetch.schema.json'),
  webInspect: await readJson('schemas', 'zaowu.command.web-inspect.schema.json'),
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
ajv.addSchema(schemas.plugin);

const validators = {
  aiAsk: ajv.compile(schemas.aiAsk),
  aiProviders: ajv.compile(schemas.aiProviders),
  autoValidate: ajv.compile(schemas.autoValidate),
  autoPlan: ajv.compile(schemas.autoPlan),
  autoRun: ajv.compile(schemas.autoRun),
  configMigrate: ajv.compile(schemas.configMigrate),
  configGet: ajv.compile(schemas.configGet),
  configPath: ajv.compile(schemas.configPath),
  configSet: ajv.compile(schemas.configSet),
  configShow: ajv.compile(schemas.configShow),
  configValidate: ajv.compile(schemas.configValidate),
  dataAnalyze: ajv.compile(schemas.dataAnalyze),
  dataClean: ajv.compile(schemas.dataClean),
  dataInspect: ajv.compile(schemas.dataInspect),
  dataSample: ajv.compile(schemas.dataSample),
  dataSchema: ajv.compile(schemas.dataSchema),
  dataSheets: ajv.compile(schemas.dataSheets),
  devCommit: ajv.compile(schemas.devCommit),
  devReview: ajv.compile(schemas.devReview),
  devStatus: ajv.compile(schemas.devStatus),
  devSync: ajv.compile(schemas.devSync),
  docConvert: ajv.compile(schemas.docConvert),
  docExtract: ajv.compile(schemas.docExtract),
  docOutline: ajv.compile(schemas.docOutline),
  docSearch: ajv.compile(schemas.docSearch),
  docSummary: ajv.compile(schemas.docSummary),
  doctor: ajv.compile(schemas.doctor),
  error: ajv.compile(schemas.error),
  help: ajv.compile(schemas.help),
  init: ajv.compile(schemas.init),
  pluginInstall: ajv.compile(schemas.pluginInstall),
  pluginList: ajv.compile(schemas.pluginList),
  pluginRemove: ajv.compile(schemas.pluginRemove),
  pluginValidate: ajv.compile(schemas.pluginValidate),
  teachPlan: ajv.compile(schemas.teachPlan),
  teachQuiz: ajv.compile(schemas.teachQuiz),
  version: ajv.compile(schemas.version),
  webFetch: ajv.compile(schemas.webFetch),
  webInspect: ajv.compile(schemas.webInspect),
};

const assertValid = (name, value) => {
  const validator = validators[name];
  const jsonValue = JSON.parse(JSON.stringify(value));

  assert(
    validator(jsonValue),
    `${name} JSON contract errors: ${ajv.errorsText(validator.errors, { separator: '; ' })}`
  );
};

const assertJsonEqual = (left, right, message) => {
  assert(JSON.stringify(left) === JSON.stringify(right), message);
};

const assertSchemaFragmentsStayAligned = () => {
  const ref = (definitionName) =>
    `https://schemas.zaowu.dev/zaowu.command.shared.schema.json#/$defs/${definitionName}`;
  const operationPlan = schemas.shared.$defs.operationPlan;

  for (const field of ['subjects', 'fingerprintAlgorithm', 'fingerprint']) {
    assert(
      operationPlan.required.includes(field),
      `shared operationPlan must require ${field}.`
    );
  }
  assert(
    operationPlan.properties.fingerprintAlgorithm.const === 'sha256-v1',
    'shared operationPlan fingerprint algorithm must be sha256-v1.'
  );

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
    schemas.devCommit.properties.findings.items,
    { $ref: ref('devReviewFinding') },
    'dev commit findings schema must reference the shared devReviewFinding fragment.'
  );
  assertJsonEqual(
    schemas.devReview.properties.findings.items,
    { $ref: ref('devReviewFinding') },
    'dev review findings schema must reference the shared devReviewFinding fragment.'
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
    schemas.devSync.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'dev sync operationPlan schema must reference the shared operationPlan fragment.'
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
    schemas.docConvert.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'doc convert operationPlan schema must reference the shared operationPlan fragment.'
  );
  assertJsonEqual(
    schemas.dataClean.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'data clean operationPlan schema must reference the shared operationPlan fragment.'
  );
  assertJsonEqual(
    schemas.pluginInstall.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'plugin install operationPlan schema must reference the shared operationPlan fragment.'
  );
  assertJsonEqual(
    schemas.pluginRemove.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'plugin remove operationPlan schema must reference the shared operationPlan fragment.'
  );
  assertJsonEqual(
    schemas.webInspect.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'web inspect operationPlan schema must reference the shared operationPlan fragment.'
  );
  assertJsonEqual(
    schemas.webFetch.properties.operationPlan,
    { $ref: ref('operationPlan') },
    'web fetch operationPlan schema must reference the shared operationPlan fragment.'
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
    runGit(fixtureRoot, ['config', 'user.email', 'test@example.com']);
    runGit(fixtureRoot, ['config', 'user.name', 'test']);

    await writeFile(path.join(fixtureRoot, 'README.md'), '# Initial');
    runGit(fixtureRoot, ['add', 'README.md']);
    runGit(fixtureRoot, ['commit', '-m', 'initial', '--quiet']);

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
const data = await importBuiltPackage('data');
const dev = await importBuiltPackage('dev');
const doc = await importBuiltPackage('doc');
const plugin = await importBuiltPackage('plugin');
const teach = await importBuiltPackage('teach');
const web = await importBuiltPackage('web');
const { COMMAND_CONTRACTS } = await import(
  pathToFileURL(path.join(root, 'packages', 'cli', 'dist', 'command-contracts.js')).href
);

assertSchemaFragmentsStayAligned();

for (const contract of COMMAND_CONTRACTS.filter((candidate) => candidate.id !== 'root.help')) {
  assert(
    typeof contract.schemaFile === 'string',
    `${contract.id} must register a result schema file.`
  );
  assert(
    Object.values(schemas).some((schema) => path.basename(contract.schemaFile) === path.basename(new URL(schema.$id).pathname)),
    `${contract.id} schema file must be loaded by the JSON contract gate.`
  );
}

const cliVersion = runCliJson(['--version']);

assertValid('version', cliVersion);
assert(cliVersion.schemaVersion === 1, 'CLI version schemaVersion must be 1.');

for (const contract of COMMAND_CONTRACTS) {
  const help = runCliJson([...contract.helpArgs]);

  assertValid('help', help);
  assert(help.schemaVersion === 1, `${contract.id} help schemaVersion must be 1.`);
}

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

const documentPath = path.join(root, 'examples', 'docs', 'report.md');
const dataPath = path.join(root, 'examples', 'data', 'sales.csv');
const pluginSourcePath = path.join(root, 'examples', 'plugins', 'hello');
const packageFixture = await mkdtemp(path.join(tmpdir(), 'zaowu-package-contract-'));

try {
  const documentSummary = await doc.summarizeDocument(documentPath);
  const documentExtract = await doc.extractDocument(documentPath);
  const documentOutline = await doc.outlineDocument(documentPath);
  const documentSearch = await doc.searchDocument(documentPath, 'ZaoWu');
  const documentConversion = await doc.convertDocument(documentPath, {
    outputPath: path.join(packageFixture, 'report.txt'),
  });

  assertValid('docSummary', documentSummary);
  assertValid('docExtract', documentExtract);
  assertValid('docOutline', documentOutline);
  assertValid('docSearch', documentSearch);
  assertValid('docConvert', documentConversion);
  assert(
    documentConversion.schemaVersion === 1,
    'doc convert result schemaVersion must be 1.'
  );
  assert(documentConversion.status === 'preview', 'doc convert package output should preview.');

  const dataInspection = await data.inspectData(dataPath);
  const dataAnalysis = await data.analyzeData(dataPath);
  const dataCleaning = await data.cleanData(dataPath, {
    outputPath: path.join(packageFixture, 'sales-clean.csv'),
  });
  const dataShape = await data.inferDataSchema(dataPath);
  const dataSample = await data.sampleData(dataPath, { rows: 2 });
  const dataSheets = await data.listSheets(dataPath);

  assertValid('dataInspect', dataInspection);
  assertValid('dataAnalyze', dataAnalysis);
  assertValid('dataClean', dataCleaning);
  assertValid('dataSchema', dataShape);
  assertValid('dataSample', dataSample);
  assertValid('dataSheets', dataSheets);
  assert(dataCleaning.schemaVersion === 1, 'data clean result schemaVersion must be 1.');
  assert(dataCleaning.status === 'preview', 'data clean package output should preview.');

  const pluginList = await plugin.listPlugins({ cwd: packageFixture });
  const pluginInstall = await plugin.installPlugin('contract-plugin', { cwd: packageFixture });
  const pluginRemove = await plugin.removePlugin('contract-plugin', { cwd: packageFixture });
  const pluginValidation = await plugin.validatePluginSource(pluginSourcePath);

  assertValid('pluginList', pluginList);
  assertValid('pluginInstall', pluginInstall);
  assertValid('pluginRemove', pluginRemove);
  assertValid('pluginValidate', pluginValidation);
  assert(pluginInstall.status === 'preview', 'plugin install package output should preview.');
  assert(pluginRemove.status === 'preview', 'plugin remove package output should preview.');

  const teachingPlan = await teach.createTeachingPlan('TypeScript basics');
  const teachingQuiz = await teach.createTeachingQuiz(
    'Variables store values. Functions group behavior.'
  );

  assertValid('teachPlan', teachingPlan);
  assertValid('teachQuiz', teachingQuiz);

  const fetcher = async (_url, init) => ({
    status: 200,
    statusText: 'OK',
    headers: {
      forEach(callback) {
        callback(init?.method === 'HEAD' ? 'text/html' : 'text/plain', 'content-type');
      },
    },
    async text() {
      return 'Contract body';
    },
  });
  const webInspectionPreview = await web.inspectWebTarget('https://example.com');
  const webInspection = await web.inspectWebTarget('https://example.com', {
    yes: true,
    fetcher,
  });
  const webFetchPreview = await web.fetchWebTarget('https://example.com');
  const webFetch = await web.fetchWebTarget('https://example.com', {
    yes: true,
    fetcher,
  });

  assertValid('webInspect', webInspectionPreview);
  assertValid('webInspect', webInspection);
  assertValid('webFetch', webFetchPreview);
  assertValid('webFetch', webFetch);
  assert(webInspectionPreview.status === 'preview', 'web inspect should preview by default.');
  assert(webFetchPreview.status === 'preview', 'web fetch should preview by default.');
} finally {
  await rm(packageFixture, { force: true, recursive: true });
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

  if (key === 'rev-parse HEAD') {
    return 'commit_hash_123';
  }

  if (key === 'fetch origin') {
    return 'fetched';
  }

  if (key === 'reset --hard origin/main') {
    return 'reset';
  }

  throw new Error(`Unexpected git command: ${key}`);
};

const commit = dev.previewDevCommit(runner);
const review = dev.reviewDevChanges(runner, { mode: 'staged' });
const status = dev.getDevStatus(runner);

assert(commit.schemaVersion === 1, 'dev commit result schemaVersion must be 1.');
assert(commit.source === 'staged', 'dev commit should use staged changes.');
assert(commit.suggestion?.title === commit.message, 'dev commit suggestion title must match message.');
assert(
  commit.findings.some((finding) => finding.title === 'Shell execution added'),
  'dev commit must expose staged diff risk findings.'
);
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

const devSyncPreview = dev.syncDevRepo(runner);
const devSync = dev.syncDevRepo(runner, { yes: true });

assert(devSyncPreview.schemaVersion === 1, 'dev sync result schemaVersion must be 1.');
assert(devSyncPreview.status === 'preview', 'dev sync default mode must preview.');
assert(devSync.status === 'ok', 'dev sync confirmed mode must succeed.');
assertValid('devSync', devSyncPreview);
assertValid('devSync', devSync);

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
const cliAIPreviewEnvModel = runCliJson(['ai', 'ask', 'Summarize', '--provider', 'openai'], {
  env: {
    ...process.env,
    OPENAI_MODEL: 'contract-env-model',
  },
});
const cliValidation = runCliJson(['auto', 'validate', cliWorkflowPath]);
const cliPlan = runCliJson(['auto', 'plan', cliWorkflowPath]);
const cliRun = runCliJson(['auto', 'run', cliWorkflowPath]);
const cliDocSummary = runCliJson(['doc', 'summary', documentPath]);
const cliDocExtract = runCliJson(['doc', 'extract', documentPath]);
const cliDocConvert = runCliJson(['doc', 'convert', documentPath]);
const cliDocOutline = runCliJson(['doc', 'outline', documentPath]);
const cliDocSearch = runCliJson(['doc', 'search', documentPath, 'ZaoWu']);
const cliDataInspect = runCliJson(['data', 'inspect', dataPath]);
const cliDataAnalyze = runCliJson(['data', 'analyze', dataPath]);
const cliDataClean = runCliJson(['data', 'clean', dataPath]);
const cliDataSchema = runCliJson(['data', 'schema', dataPath]);
const cliDataSample = runCliJson(['data', 'sample', dataPath, '--rows', '2']);
const cliDataSheets = runCliJson(['data', 'sheets', dataPath]);
const cliPluginValidation = runCliJson(['plugin', 'validate', pluginSourcePath]);
const cliTeachPlan = runCliJson(['teach', 'plan', 'TypeScript basics']);
const cliTeachQuiz = runCliJson([
  'teach',
  'quiz',
  'Variables store values. Functions group behavior.',
]);
const cliWebInspect = runCliJson(['web', 'inspect', 'https://example.com']);
const cliWebFetch = runCliJson(['web', 'fetch', 'https://example.com']);

try {
  const cliInitPreview = runCliJson(['init'], { cwd: cliInitFixture });
  const cliInitMismatch = runCliErrorJson(
    ['init', '--yes', '--plan-fingerprint', '0'.repeat(64)],
    'OPERATION_PLAN_MISMATCH',
    { cwd: cliInitFixture }
  );
  const cliInitCreated = runCliJson(
    ['init', '--yes', '--plan-fingerprint', cliInitPreview.operationPlan.fingerprint],
    { cwd: cliInitFixture }
  );
  const cliConfigPath = runCliJson(['config', 'path'], { cwd: cliInitFixture });
  const cliConfigShow = runCliJson(['config', 'show'], { cwd: cliInitFixture });
  const cliConfigGet = runCliJson(['config', 'get', 'project.name'], {
    cwd: cliInitFixture,
  });
  const cliConfigValidation = runCliJson(['config', 'validate'], { cwd: cliInitFixture });
  const cliConfigSet = runCliJson(['config', 'set', 'project.name', 'contract-cli'], {
    cwd: cliInitFixture,
  });
  const cliConfigMigration = runCliJson(['config', 'migrate'], { cwd: cliInitFixture });
  const cliPluginList = runCliJson(['plugin', 'list'], { cwd: cliInitFixture });
  const cliPluginInstall = runCliJson(['plugin', 'install', 'contract-plugin'], {
    cwd: cliInitFixture,
  });
  const cliPluginRemove = runCliJson(['plugin', 'remove', 'contract-plugin'], {
    cwd: cliInitFixture,
  });

  assertValid('init', cliInitPreview);
  assertValid('init', cliInitCreated);
  assertValid('configPath', cliConfigPath);
  assertValid('configShow', cliConfigShow);
  assertValid('configGet', cliConfigGet);
  assertValid('configSet', cliConfigSet);
  assertValid('configMigrate', cliConfigMigration);
  assertValid('configValidate', cliConfigValidation);
  assertValid('pluginList', cliPluginList);
  assertValid('pluginInstall', cliPluginInstall);
  assertValid('pluginRemove', cliPluginRemove);
  assert(cliInitPreview.schemaVersion === 1, 'CLI init preview schemaVersion must be 1.');
  assert(cliInitPreview.dryRun === true, 'CLI init preview should report dryRun true.');
  assert(
    cliInitPreview.operationPlan?.confirmationRequired === true,
    'CLI init preview should require confirmation.'
  );
  assert(
    /^[a-f0-9]{64}$/.test(cliInitPreview.operationPlan?.fingerprint ?? ''),
    'CLI init preview should expose a sha256 operation plan fingerprint.'
  );
  assert(
    cliInitPreview.operationPlan?.fingerprintAlgorithm === 'sha256-v1',
    'CLI init preview should expose the operation plan fingerprint algorithm.'
  );
  assert(
    cliInitMismatch.error.code === 'OPERATION_PLAN_MISMATCH',
    'CLI init should reject mismatched operation plan fingerprints.'
  );
  assert(cliInitCreated.schemaVersion === 1, 'CLI init created schemaVersion must be 1.');
  assert(
    cliInitCreated.operationPlan?.confirmationRequired === false,
    'CLI init created output should not require further confirmation.'
  );
  assert(
    cliInitCreated.operationPlan?.fingerprint === cliInitPreview.operationPlan?.fingerprint,
    'CLI init confirmation should preserve the preview operation plan fingerprint.'
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
  assert(
    /^[a-f0-9]{64}$/.test(cliConfigSet.operationPlan?.fingerprint ?? ''),
    'CLI config set preview should expose an operation plan fingerprint.'
  );
  assert(cliConfigMigration.schemaVersion === 1, 'CLI config migrate schemaVersion must be 1.');
  assert(
    cliConfigMigration.operationPlan?.confirmationRequired === false,
    'CLI config migrate unchanged output should not require confirmation.'
  );
  assert(cliConfigPath.schemaVersion === 1, 'CLI config path schemaVersion must be 1.');
  assert(cliConfigShow.schemaVersion === 1, 'CLI config show schemaVersion must be 1.');
  assert(cliConfigGet.schemaVersion === 1, 'CLI config get schemaVersion must be 1.');
  assert(
    cliPluginInstall.operationPlan?.confirmationRequired === true,
    'CLI plugin install preview should require confirmation.'
  );
  assert(
    cliPluginRemove.operationPlan?.confirmationRequired === true,
    'CLI plugin remove preview should require confirmation.'
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
assertValid('aiAsk', cliAIPreviewEnvModel);
assert(
  cliAIPreviewEnvModel.model === 'contract-env-model',
  'CLI network ai preview should use OPENAI_MODEL when --model is absent.'
);
assert(
  cliAIPreviewEnvModel.operationPlan?.subjects?.includes('model:contract-env-model'),
  'CLI network ai operation plan should disclose the resolved env model.'
);
assert(
  cliDoctor.operationPlan?.executes?.includes('corepack pnpm --version'),
  'CLI doctor operation plan should disclose the Corepack pnpm check.'
);
assert(
  ['Node.js', 'Git', 'pnpm', 'Config', 'AI provider', 'Command matrix'].every((name) =>
    cliDoctor.checks.some((check) => check.name === name)
  ),
  'CLI doctor should expose Node.js, Git, pnpm, Config, AI provider, and command matrix checks.'
);
assertValid('autoValidate', cliValidation);
assertValid('autoPlan', cliPlan);
assertValid('autoRun', cliRun);
assert(cliRun.status === 'preview', 'CLI auto run should preview by default.');
assertValid('docSummary', cliDocSummary);
assertValid('docExtract', cliDocExtract);
assertValid('docConvert', cliDocConvert);
assertValid('docOutline', cliDocOutline);
assertValid('docSearch', cliDocSearch);
assert(cliDocConvert.schemaVersion === 1, 'CLI doc convert schemaVersion must be 1.');
assert(
  cliDocConvert.operationPlan?.confirmationRequired === false,
  'CLI doc convert without an output path should not require confirmation.'
);
assertValid('dataInspect', cliDataInspect);
assertValid('dataAnalyze', cliDataAnalyze);
assertValid('dataClean', cliDataClean);
assertValid('dataSchema', cliDataSchema);
assertValid('dataSample', cliDataSample);
assertValid('dataSheets', cliDataSheets);
assert(cliDataClean.schemaVersion === 1, 'CLI data clean schemaVersion must be 1.');
assert(
  cliDataClean.operationPlan?.confirmationRequired === false,
  'CLI data clean without an output path should not require confirmation.'
);
assertValid('pluginValidate', cliPluginValidation);
assertValid('teachPlan', cliTeachPlan);
assertValid('teachQuiz', cliTeachQuiz);
assertValid('webInspect', cliWebInspect);
assertValid('webFetch', cliWebFetch);
assert(
  cliWebInspect.operationPlan?.confirmationRequired === true,
  'CLI web inspect preview should require confirmation.'
);
assert(
  cliWebFetch.operationPlan?.confirmationRequired === true,
  'CLI web fetch preview should require confirmation.'
);

const devReviewCliFixture = await createDevReviewCliFixture();

try {
  const cliStatus = runCliJson(['dev', 'status'], { cwd: devReviewCliFixture });
  const cliCommit = runCliJson(['dev', 'commit'], { cwd: devReviewCliFixture });
  const cliReview = runCliJson(['dev', 'review', '--staged'], { cwd: devReviewCliFixture });
  const cliDevSync = runCliJson(['dev', 'sync'], { cwd: devReviewCliFixture });

  assertValid('devStatus', cliStatus);
  assertValid('devCommit', cliCommit);
  assertValid('devReview', cliReview);
  assertValid('devSync', cliDevSync);
  assert(cliStatus.schemaVersion === 1, 'CLI dev status schemaVersion must be 1.');
  assert(cliDevSync.schemaVersion === 1, 'CLI dev sync schemaVersion must be 1.');
  assert(cliDevSync.status === 'preview', 'CLI dev sync should preview by default.');
  assert(
    cliDevSync.operationPlan?.confirmationRequired === true,
    'CLI dev sync preview should require confirmation.'
  );
  assert(
    cliStatus.operationPlan?.executes?.includes('git status --short --branch'),
    'CLI dev status operation plan should disclose git status.'
  );
  assert(cliCommit.schemaVersion === 1, 'CLI dev commit schemaVersion must be 1.');
  assert(
    cliCommit.suggestion?.title === cliCommit.message,
    'CLI dev commit suggestion title must match message.'
  );
  assert(
    cliCommit.findings.some((finding) => finding.title === 'Shell execution added'),
    'CLI dev commit should expose deterministic shell-execution findings.'
  );
  assert(
    cliCommit.operationPlan?.reads?.includes('staged git diff'),
    'CLI dev commit operation plan should disclose staged diff reads.'
  );
  assert(
    cliCommit.operationPlan?.executes?.includes('git diff --cached'),
    'CLI dev commit operation plan should disclose git diff execution.'
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
