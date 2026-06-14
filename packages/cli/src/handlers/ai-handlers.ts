import {
  askAI,
  listAIProviders,
  previewAIRequest,
  resolveAIModel,
  validateAIProviderConfig,
} from '@zaowu/ai';
import {
  assertOperationPlanFingerprint,
  createOperationPlan,
  formatOperationPlan,
  getValue,
  result,
  withOperationPlan,
  type DomainActionHandler,
} from '../handler-utils.js';

export const handleAiAsk: DomainActionHandler = async (args, context) => {
  const prompt = args.join(' ').trim();
  const filePath = getValue(context.parsed, '--file');
  const requestedProvider = getValue(context.parsed, '--provider');
  const requestedModel = getValue(context.parsed, '--model');
  const providerValidation = validateAIProviderConfig(requestedProvider);
  const provider = providerValidation.provider;
  const resolvedModel = resolveAIModel(provider, { model: requestedModel });
  const operationPlan = createOperationPlan({
    risk: provider.network ? 'medium' : 'low',
    confirmationRequired: provider.network && !context.yes,
    subjects: [`ai:${provider.id}`, `model:${resolvedModel}`],
    reads: filePath ? [filePath] : [],
    network: provider.network ? [provider.id] : [],
    secrets: provider.requiredEnv,
    notes: [
      provider.network
        ? 'Network AI providers preview by default and require --yes to send a request.'
        : 'The local echo provider does not call external services.',
    ],
  });

  if (provider.network && !context.yes) {
    const preview = await previewAIRequest({
      prompt,
      filePath,
      provider: requestedProvider,
      model: requestedModel,
    });
    const payload = {
      schemaVersion: preview.schemaVersion,
      status: 'preview',
      provider,
      model: preview.model,
      input: preview.input,
      output: null,
      validation: preview.validation,
    };
    const human = [
      'ZaoWu AI Ask',
      '',
      'Status: preview',
      `Provider: ${provider.id} (${provider.name})`,
      `Model: ${preview.model}`,
      '',
      formatOperationPlan(operationPlan),
      '',
      'No provider request was sent. Re-run with --yes to send it.',
    ].join('\n');

    return result(context, withOperationPlan(payload, operationPlan), human);
  }

  assertOperationPlanFingerprint(context, operationPlan);

  if (context.onChunk && !context.json) {
    const onChunk = context.onChunk;
    const header = [
      'ZaoWu AI Ask',
      '',
      `Provider: ${provider.id} (${provider.name})`,
      `Model: ${resolvedModel}`,
      '',
      formatOperationPlan(operationPlan),
      '',
      'Output:',
      '',
    ].join('\n');
    onChunk(header);

    let streamedAnyChunk = false;
    const response = await askAI({
      prompt,
      filePath,
      provider: requestedProvider,
      model: requestedModel,
      allowNetwork: context.yes,
      onChunk: (chunk) => {
        streamedAnyChunk = true;
        onChunk(chunk);
      },
    });

    // Providers that do not support streaming (echo, OpenAI, non-stream paths)
    // never call onChunk. Print their full output so the human-readable
    // command does not silently produce an empty result.
    if (!streamedAnyChunk) {
      onChunk(response.output);
    }

    onChunk('\n');

    return result(context, withOperationPlan(response, operationPlan), '');
  }

  const response = await askAI({
    prompt,
    filePath,
    provider: requestedProvider,
    model: requestedModel,
    allowNetwork: context.yes,
  });
  const payload = response;
  const human = [
    'ZaoWu AI Ask',
    '',
    `Provider: ${response.provider.id} (${response.provider.name})`,
    `Model: ${response.model}`,
    '',
    formatOperationPlan(operationPlan),
    '',
    'Output:',
    response.output,
  ].join('\n');

  return result(context, withOperationPlan(payload, operationPlan), human);
};

export const handleAiProviders: DomainActionHandler = async (_args, context) => {
  const providers = listAIProviders();
  const activeProvider = getValue(context.parsed, '--provider');
  const validation = activeProvider ? validateAIProviderConfig(activeProvider) : undefined;
  const payload = {
    schemaVersion: 1,
    status: validation?.status ?? 'ok',
    providers,
    validation,
  };
  const human = [
    'ZaoWu AI Providers',
    '',
    ...providers.map((provider) => {
      const flags = [
        provider.network ? 'network' : 'local',
        provider.configured ? 'configured' : 'missing config',
      ];

      return `- ${provider.id}: ${provider.name} (${flags.join(', ')})`;
    }),
    '',
    validation?.warnings.length
      ? ['Warnings:', ...validation.warnings.map((warning) => `- ${warning}`)].join('\n')
      : 'Warnings: none',
  ].join('\n');

  return result(context, payload, human);
};
