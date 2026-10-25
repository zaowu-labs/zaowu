import { ZaoWuError } from '@zaowu-labs/core';

const invalidCompletion = (): never => {
  throw new ZaoWuError({
    code: 'AI_PROVIDER_RESPONSE_INVALID',
    message: 'AI provider did not complete a text answer.',
    why: 'The provider explicitly reported an error, unfinished generation, output limit, or a stop requiring unsupported continuation.',
    fix: 'Any partial output is incomplete. Retry with a smaller input or check the model settings; ZaoWu did not automatically resend the request.',
  });
};

/** Missing metadata is tolerated for compatible proxies; explicit failure is not. */
export const assertCompletedAIResponse = (provider: string, payload: unknown): void => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  const response = payload as Record<string, unknown>;
  if (response.error !== undefined && response.error !== null) invalidCompletion();
  if (provider === 'openai') {
    if (response.status !== undefined && response.status !== 'completed') invalidCompletion();
    if (response.incomplete_details !== undefined && response.incomplete_details !== null)
      invalidCompletion();
    if (Array.isArray(response.choices)) {
      const choice = response.choices[0] as { finish_reason?: unknown } | null | undefined;
      if (choice?.finish_reason !== undefined && choice.finish_reason !== 'stop')
        invalidCompletion();
    }
  } else if (provider === 'anthropic') {
    if (
      response.stop_reason !== undefined &&
      !['end_turn', 'stop_sequence'].includes(String(response.stop_reason))
    )
      invalidCompletion();
  } else if (provider === 'ollama') {
    if (response.done !== undefined && response.done !== true) invalidCompletion();
    if (response.done_reason !== undefined && response.done_reason !== 'stop') invalidCompletion();
  }
};
