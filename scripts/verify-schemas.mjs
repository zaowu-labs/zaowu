/* global console */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const readText = (...parts) => readFile(path.join(root, ...parts), 'utf8');
const readJson = async (...parts) => JSON.parse(await readText(...parts));
const importBuiltPackage = (name) =>
  import(pathToFileURL(path.join(root, 'packages', name, 'dist', 'index.js')).href);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: false,
});

const schemas = {
  config: await readJson('schemas', 'zaowu.config.schema.json'),
  workflow: await readJson('schemas', 'zaowu.workflow.schema.json'),
  plugin: await readJson('schemas', 'zaowu.plugin.schema.json'),
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
  assert(schema.type === 'object', `${name} schema should describe an object.`);
  assert(ajv.validateSchema(schema), `${name} schema should be a valid JSON Schema.`);
}

assert(schemas.config.properties.version.const === 1, 'Config schema should pin version 1.');
assert(
  schemas.plugin.properties.schemaVersion.const === 1,
  'Plugin schema should pin schemaVersion 1.'
);
assert(schemas.workflow.properties.steps.type === 'array', 'Workflow schema should describe steps.');

const validators = {
  config: ajv.compile(schemas.config),
  workflow: ajv.compile(schemas.workflow),
  plugin: ajv.compile(schemas.plugin),
};

const formatErrors = (name, validator) =>
  `${name} schema errors: ${ajv.errorsText(validator.errors, { separator: '; ' })}`;

const assertValid = (name, validator, value) => {
  assert(validator(value), formatErrors(name, validator));
};

const assertInvalid = (validator, value, message) => {
  assert(!validator(value), message);
};

const { parseConfig } = await importBuiltPackage('config');
const { validateWorkflowContent } = await importBuiltPackage('auto');
const { validatePluginSource } = await importBuiltPackage('plugin');

const config = parseConfig(await readText('examples', 'config', 'zw.yml'), 'zw.yml');
assert(config.version === 1, 'Example config should parse as version 1.');
assert(config.project.name === 'zaowu-example', 'Example config should expose the project name.');
assert(config.defaults.output === 'human', 'Example config should keep human output by default.');
assertValid('config', validators.config, config);
assertInvalid(
  validators.config,
  {
    ...config,
    defaults: {
      output: 'xml',
    },
  },
  'Config schema should reject unsupported output formats.'
);

const messageWorkflow = validateWorkflowContent(
  await readText('examples', 'workflows', 'message.yml'),
  'message.yml'
);
assert(messageWorkflow.warnings.length === 0, 'Message workflow example should not warn.');
assert(
  messageWorkflow.workflow.steps[0]?.message === 'Hello {{target}}',
  'Message workflow should keep its message step.'
);
assertValid('workflow', validators.workflow, messageWorkflow.workflow);

const blockedWorkflow = validateWorkflowContent(
  await readText('examples', 'workflows', 'blocked-shell.yml'),
  'blocked-shell.yml'
);
assert(
  blockedWorkflow.warnings.some((warning) => warning.includes('shell execution')),
  'Blocked shell workflow should demonstrate shell warning behavior.'
);
assertValid('workflow', validators.workflow, blockedWorkflow.workflow);
assertInvalid(
  validators.workflow,
  {
    name: 'missing-step-action',
    steps: [
      {
        name: 'empty',
      },
    ],
  },
  'Workflow schema should reject steps without a supported action.'
);
assertInvalid(
  validators.workflow,
  {
    ...messageWorkflow.workflow,
    permissions: {
      shell: 'always',
    },
  },
  'Workflow schema should reject unsupported permission modes.'
);
assertInvalid(
  validators.workflow,
  {
    ...messageWorkflow.workflow,
    permissions: {
      filesystem: 'prompt',
    },
  },
  'Workflow schema should reject unsupported permission keys.'
);

const pluginValidation = await validatePluginSource(
  path.join(root, 'examples', 'plugins', 'hello')
);
assert(pluginValidation.status === 'ok', 'Example plugin manifest should validate.');
assert(pluginValidation.manifest?.id === 'hello-tools', 'Example plugin id should be stable.');
assertValid('plugin', validators.plugin, pluginValidation.manifest);
assertInvalid(
  validators.plugin,
  {
    ...pluginValidation.manifest,
    id: 'Hello Tools',
  },
  'Plugin schema should reject invalid plugin ids.'
);

console.log('ZaoWu schemas and examples: ok');
