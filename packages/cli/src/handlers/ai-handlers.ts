import {
  askAI,
  listAIProviders,
  previewAIRequest,
  resolveAIRequestContentSubjects,
  validateAIProviderConfig,
} from '@zaowu-labs/ai';
import {
  assertOperationPlanFingerprint,
  createOperationPlan,
  formatConfirmCommand,
  formatLabeledList,
  formatOperationPlan,
  getValue,
  resolveAiProvider,
  result,
  withOperationPlan,
  type DomainActionHandler,
} from '../handler-utils.js';

export const handleAiAsk: DomainActionHandler = async (args, context) => {
  const prompt = args.join(' ').trim();
  const filePath = getValue(context.parsed, '--file');
  // Shared resolution: --provider first, then `ai.provider` from zw.yml, then
  // the default — the same order `zw dev --ai` and `zw doctor` use.
  const ai = await resolveAiProvider(context);
  const { provider, resolvedModel, networkTarget } = ai;
  // Bind the exact prompt + file payload into the plan so a preview fingerprint
  // only matches a confirmed run that sends identical content.
  const contentSubjects = await resolveAIRequestContentSubjects({
    prompt,
    filePath,
    provider: ai.providerId,
    model: ai.requestedModel,
  });
  const operationPlan = createOperationPlan({
    risk: provider.network ? 'medium' : 'low',
    confirmationRequired: provider.network && !context.yes,
    subjects: [`ai:${provider.id}`, `model:${resolvedModel}`, ...contentSubjects],
    reads: filePath ? [filePath] : [],
    network: networkTarget ? [networkTarget] : [],
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
      provider: ai.providerId,
      model: ai.requestedModel,
    });
    const payload = {
      schemaVersion: preview.schemaVersion,
      status: 'preview',
      provider,
      model: preview.model,
      endpoint: preview.endpoint,
      input: preview.input,
      output: null,
      usage: null,
      validation: preview.validation,
    };
    // Pin the RESOLVED provider id, so a confirm command copied from a preview
    // whose provider came from `zw.yml` keeps working even if the config
    // changes in between (the fingerprint would reject the mismatch anyway).
    const confirmCommand = formatConfirmCommand([
      'zw',
      'ai',
      'ask',
      ...args,
      ...(filePath ? ['--file', filePath] : []),
      '--provider',
      ai.providerId,
      ...(ai.requestedModel ? ['--model', ai.requestedModel] : []),
      '--yes',
      '--plan-fingerprint',
      operationPlan.fingerprint,
    ]);
    const human = [
      'ZaoWu AI Ask',
      '',
      'Status: preview',
      `Provider: ${provider.id} (${provider.name})`,
      `Model: ${preview.model}`,
      `Endpoint: ${preview.endpoint ?? 'local'}`,
      '',
      formatOperationPlan(operationPlan),
      '',
      'No provider request was sent.',
      '',
      'To send exactly this AI request, run:',
      `  ${confirmCommand}`,
    ].join('\n');

    return result(context, withOperationPlan(payload, operationPlan), human);
  }

  assertOperationPlanFingerprint(context, operationPlan);

  if (context.onChunk && !context.json) {
    const onChunk = context.onChunk;
    const plannedEndpoint = operationPlan.network[0] ?? null;
    const header = [
      'ZaoWu AI Ask',
      '',
      `Provider: ${provider.id} (${provider.name})`,
      `Model: ${resolvedModel}`,
      `Endpoint: ${plannedEndpoint ?? 'local'}`,
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
      provider: ai.providerId,
      model: ai.requestedModel,
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
    provider: ai.providerId,
    model: ai.requestedModel,
    allowNetwork: context.yes,
  });
  const payload = response;
  const human = [
    'ZaoWu AI Ask',
    '',
    `Provider: ${response.provider.id} (${response.provider.name})`,
    `Model: ${response.model}`,
    `Endpoint: ${response.endpoint ?? 'local'}`,
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
    formatLabeledList('Warnings', validation?.warnings),
  ].join('\n');

  return result(context, payload, human);
};
