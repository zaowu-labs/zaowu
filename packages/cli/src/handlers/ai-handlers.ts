import {
  askAI,
  listAIProviders,
  previewAIRequest,
  resolveAIRequestContentSubjects,
  validateAIProviderConfig,
  prepareAIOutputPath,
  saveAIAnswer,
  readAIStdin,
} from '@zaowu-labs/ai';
import { createResult } from '../output.js';
import {
  assertOperationPlanFingerprint,
  createOperationPlan,
  formatConfirmCommand,
  formatLabeledList,
  formatOperationPlan,
  getValue,
  hasFlag,
  resolveAiProvider,
  resolveFileTarget,
  result,
  withOperationPlan,
  type DomainActionHandler,
} from '../handler-utils.js';

export const handleAiAsk: DomainActionHandler = async (args, context) => {
  const raw = hasFlag(context.parsed, '--raw');
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
  const usesStdin = hasFlag(context.parsed, '--stdin');
  const stdinText = usesStdin ? await readAIStdin(context.stdin, context.signal) : undefined;
  const request = {
    prompt,
    filePath,
    stdinText,
    provider: ai.providerId,
    model: ai.requestedModel,
    signal: context.signal,
  };
  // Bind the exact payload so confirmation can only reuse an identical input.
  const contentSubjects = await resolveAIRequestContentSubjects(request);
  const guardedRequest = { ...request, expectedContentSubjects: contentSubjects };
  const operationPlan = createOperationPlan({
    risk: provider.network || outputPath ? 'medium' : 'low',
    confirmationRequired: Boolean((provider.network || outputPath) && !context.yes),
    subjects: [`ai:${provider.id}`, `model:${resolvedModel}`, ...contentSubjects],
    reads: usesStdin ? ['standard input (stdin)'] : filePath ? [filePath] : [],
    network: networkTarget ? [networkTarget] : [],
    writes: outputPath ? [outputPath] : [],
    secrets: provider.requiredEnv,
    notes: [
      provider.network
        ? 'Network AI providers preview by default and require --yes to send a request.'
        : 'The local echo provider does not call external services.',
      ...(stdinText !== undefined
        ? [`Standard input contains ${stdinText.length} characters.`]
        : []),
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
      ...(raw ? ['--raw'] : []),
      ...(usesStdin ? ['--stdin'] : []),
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
      usesStdin
        ? 'Supply the same standard input again with the confirmation command below.'
        : outputPath
          ? 'To generate and save this answer, run:'
          : 'To send exactly this AI request, run:',
      `  ${confirmCommand}`,
    ].join('\n');

    return raw
      ? createResult(0, '', human)
      : result(context, withOperationPlan(payload, operationPlan), human);
  }

  assertOperationPlanFingerprint(context, operationPlan);

  const save = async (output: string): Promise<void> => {
    if (outputPath) await saveAIAnswer(outputPath, output, context.signal);
  };

  if (context.onChunk && !context.json && !raw) {
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
    ...guardedRequest,
    allowNetwork: context.yes,
  });
  await save(response.output);
  if (raw) return { ...createResult(0, response.output), rawStdout: true };
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
