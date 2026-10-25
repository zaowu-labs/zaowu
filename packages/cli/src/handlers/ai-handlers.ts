import {
  askAI,
  listAIProviders,
  previewAIRequest,
  resolveAIRequestContentSubjects,
  validateAIProviderConfig,
  prepareAIOutputPath,
  saveAIAnswer,
} from '@zaowu-labs/ai';
import {
  assertOperationPlanFingerprint,
  createOperationPlan,
  formatConfirmCommand,
  formatLabeledList,
  formatOperationPlan,
  getValue,
  resolveAiProvider,
  resolveFileTarget,
  result,
  withOperationPlan,
  type DomainActionHandler,
} from '../handler-utils.js';

export const handleAiAsk: DomainActionHandler = async (args, context) => {
  const prompt = args.join(' ').trim();
  const requestedFilePath = getValue(context.parsed, '--file');
  const filePath = requestedFilePath ? resolveFileTarget(context, requestedFilePath) : undefined;
  const requestedOutputPath = getValue(context.parsed, '--output');
  const outputPath = requestedOutputPath
    ? await prepareAIOutputPath(resolveFileTarget(context, requestedOutputPath))
    : undefined;
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
  const guardedRequest = {
    prompt,
    filePath,
    provider: ai.providerId,
    model: ai.requestedModel,
    expectedContentSubjects: contentSubjects,
  };
  const operationPlan = createOperationPlan({
    risk: provider.network || outputPath ? 'medium' : 'low',
    confirmationRequired: Boolean((provider.network || outputPath) && !context.yes),
    subjects: [`ai:${provider.id}`, `model:${resolvedModel}`, ...contentSubjects],
    reads: filePath ? [filePath] : [],
    network: networkTarget ? [networkTarget] : [],
    writes: outputPath ? [outputPath] : [],
    secrets: provider.requiredEnv,
    notes: [
      provider.network
        ? 'Network AI providers preview by default and require --yes to send a request.'
        : 'The local echo provider does not call external services.',
      ...(outputPath
        ? [
            'Only a complete successful answer creates the new output file. Existing targets are preserved.',
            'Generated answer text is unknown at preview; this plan authorizes one generation and saving its completed result to the disclosed path.',
          ]
        : []),
    ],
  });

  if ((provider.network || outputPath) && !context.yes) {
    const preview = await previewAIRequest(guardedRequest);
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
      ...(outputPath ? { outputPath, wroteFile: false } : {}),
    };
    // Pin the RESOLVED provider id, so a confirm command copied from a preview
    // whose provider came from `zw.yml` keeps working even if the config
    // changes in between (the fingerprint would reject the mismatch anyway).
    const confirmCommand = formatConfirmCommand([
      'zw',
      'ai',
      'ask',
      ...(filePath ? ['--file', filePath] : []),
      ...(outputPath ? ['--output', outputPath] : []),
      '--provider',
      ai.providerId,
      ...(ai.requestedModel ? ['--model', ai.requestedModel] : []),
      '--yes',
      '--plan-fingerprint',
      operationPlan.fingerprint,
      '--',
      ...args,
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
      outputPath
        ? 'To generate and save this answer, run:'
        : 'To send exactly this AI request, run:',
      `  ${confirmCommand}`,
    ].join('\n');

    return result(context, withOperationPlan(payload, operationPlan), human);
  }

  assertOperationPlanFingerprint(context, operationPlan);

  const save = async (output: string): Promise<void> => {
    if (outputPath) await saveAIAnswer(outputPath, output, context.signal);
  };

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
    try {
      const response = await askAI({
        signal: context.signal,
        ...guardedRequest,
        allowNetwork: context.yes,
        onChunk: (chunk) => {
          streamedAnyChunk = true;
          onChunk(chunk);
        },
      });

      // Echo and JSON-compatible proxies may return a complete response.
      if (!streamedAnyChunk) {
        onChunk(response.output);
      }
      await save(response.output);
      if (outputPath) onChunk(`\nSaved answer: ${outputPath}`);
      return result(
        context,
        withOperationPlan(
          { ...response, ...(outputPath ? { outputPath, wroteFile: true } : {}) },
          operationPlan
        ),
        ''
      );
    } finally {
      onChunk('\n');
    }
  }

  const response = await askAI({
    signal: context.signal,
    ...guardedRequest,
    allowNetwork: context.yes,
  });
  await save(response.output);
  const payload = { ...response, ...(outputPath ? { outputPath, wroteFile: true } : {}) };
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
    ...(outputPath ? ['', `Saved answer: ${outputPath}`] : []),
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
