import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AI_DOMAIN,
  askAI,
  classifyAIProviderHttpFailure,
  getAIProvider,
  listAIProviders,
  parseRetryAfterHeaderMs,
  previewAIRequest,
  validateAIProviderConfig,
} from './index';

const readOpenAIFixture = async (name: string): Promise<unknown> =>
  JSON.parse(
    await readFile(new URL(`../test/fixtures/${name}.json`, import.meta.url), 'utf8')
  ) as unknown;

describe('AI provider registry', () => {
  it('starts with a local echo provider', () => {
    expect(listAIProviders({})).toEqual([
      {
        id: 'echo',
        name: 'Local Echo',
        network: false,
        configured: true,
        requiredEnv: [],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        network: true,
        configured: false,
        requiredEnv: ['OPENAI_API_KEY'],
        defaultModel: 'gpt-4.1-mini',
      },
    ]);
  });

  it('defines the AI domain boundary', () => {
    expect(AI_DOMAIN.name).toBe('ai');
    expect(AI_DOMAIN.commands.map((command) => command.name)).toEqual(['ask', 'providers']);
  });

  it('answers through the local echo provider without network access', async () => {
    await expect(askAI({ prompt: 'Explain ZaoWu' })).resolves.toMatchObject({
      schemaVersion: 1,
      provider: {
        id: 'echo',
      },
      model: 'echo-local',
      input: {
        source: 'prompt',
        promptCharacters: 13,
      },
      output: expect.stringContaining('Explain ZaoWu'),
    });
  });

  it('can include a readable file as AI input', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-ai-'));
    const filePath = path.join(root, 'note.md');

    await writeFile(filePath, '# ZaoWu\n\nLocal file input.\n', 'utf8');

    try {
      await expect(askAI({ prompt: 'Summarize', filePath })).resolves.toMatchObject({
        input: {
          source: 'prompt+file',
          filePath,
        },
        output: expect.stringContaining('Local file input.'),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports provider configuration status', () => {
    expect(validateAIProviderConfig('openai', {})).toEqual({
      status: 'warning',
      provider: {
        id: 'openai',
        name: 'OpenAI',
        network: true,
        configured: false,
        requiredEnv: ['OPENAI_API_KEY'],
        defaultModel: 'gpt-4.1-mini',
      },
      warnings: ['Missing environment variable(s): OPENAI_API_KEY.'],
    });

    expect(validateAIProviderConfig('openai', { OPENAI_API_KEY: 'set' })).toMatchObject({
      status: 'ok',
      provider: {
        configured: true,
      },
      warnings: [],
    });
  });

  it('previews network AI input without sending a request', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-ai-'));
    const filePath = path.join(root, 'note.md');

    await writeFile(filePath, 'Local file input.\n', 'utf8');

    try {
      await expect(
        previewAIRequest({
          provider: 'openai',
          prompt: 'Summarize',
          filePath,
          env: {
            OPENAI_API_KEY: 'test-key',
          },
        })
      ).resolves.toMatchObject({
        schemaVersion: 1,
        status: 'preview',
        provider: {
          id: 'openai',
          configured: true,
        },
        model: 'gpt-4.1-mini',
        input: {
          source: 'prompt+file',
          promptCharacters: 9,
          filePath,
          fileCharacters: 18,
          maxInputCharacters: 200000,
        },
        validation: {
          status: 'ok',
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects oversized input during AI preview', async () => {
    await expect(
      previewAIRequest({
        provider: 'openai',
        prompt: 'Explain ZaoWu',
        maxInputCharacters: 5,
        env: {
          OPENAI_API_KEY: 'test-key',
        },
      })
    ).rejects.toThrow('AI input is too large.');
  });

  it('asks OpenAI through the Responses API with an environment key', async () => {
    const calls: Array<{
      url: string;
      init: {
        method: string;
        headers: Record<string, string>;
        body: string;
      };
    }> = [];

    await expect(
      askAI({
        provider: 'openai',
        prompt: 'Explain ZaoWu',
        model: 'test-model',
        allowNetwork: true,
        env: {
          OPENAI_API_KEY: 'test-key',
        },
        fetcher: async (url, init) => {
          calls.push({ url, init });

          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            async json() {
              return await readOpenAIFixture('openai-output-text');
            },
          };
        },
      })
    ).resolves.toMatchObject({
      schemaVersion: 1,
      provider: {
        id: 'openai',
        network: true,
        configured: true,
      },
      model: 'test-model',
      output: 'ZaoWu is a toolkit.',
    });

    expect(calls).toEqual([
      {
        url: 'https://api.openai.com/v1/responses',
        init: {
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-key',
            'Content-Type': 'application/json',
          },
          signal: expect.any(AbortSignal),
          body: JSON.stringify({
            model: 'test-model',
            input: 'Explain ZaoWu',
          }),
        },
      },
    ]);
  });

  it('extracts nested OpenAI text output', async () => {
    await expect(
      askAI({
        provider: 'openai',
        prompt: 'Explain ZaoWu',
        allowNetwork: true,
        env: {
          OPENAI_API_KEY: 'test-key',
        },
        fetcher: async () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          async json() {
            return await readOpenAIFixture('openai-nested-output');
          },
        }),
      })
    ).resolves.toMatchObject({
      output: 'Nested output works.',
    });
  });

  it('rejects OpenAI requests without an environment key', async () => {
    await expect(
      askAI({
        provider: 'openai',
        prompt: 'Explain ZaoWu',
        allowNetwork: true,
        env: {},
      })
    ).rejects.toThrow('AI provider configuration is missing.');
  });

  it('requires explicit confirmation for network AI providers', async () => {
    await expect(
      askAI({
        provider: 'openai',
        prompt: 'Explain ZaoWu',
        env: {
          OPENAI_API_KEY: 'test-key',
        },
      })
    ).rejects.toThrow('Network AI request requires confirmation.');
  });

  it('rejects overly large OpenAI inputs before sending a request', async () => {
    await expect(
      askAI({
        provider: 'openai',
        prompt: 'Explain ZaoWu',
        allowNetwork: true,
        maxInputCharacters: 5,
        env: {
          OPENAI_API_KEY: 'test-key',
        },
        fetcher: async () => {
          throw new Error('fetcher should not be called');
        },
      })
    ).rejects.toThrow('AI input is too large.');
  });

  it('maps OpenAI HTTP errors to actionable errors', async () => {
    await expect(
      askAI({
        provider: 'openai',
        prompt: 'Explain ZaoWu',
        allowNetwork: true,
        env: {
          OPENAI_API_KEY: 'test-key',
        },
        fetcher: async () => ({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          async json() {
            return {};
          },
        }),
      })
    ).rejects.toThrow('AI provider request failed.');
  });

  it('classifies provider HTTP failures for actionable fixes', () => {
    expect(classifyAIProviderHttpFailure('OpenAI', 401, 'Unauthorized')).toEqual({
      kind: 'auth',
      retryable: false,
      safeSummary: 'OpenAI returned HTTP 401 Unauthorized.',
      why: 'OpenAI returned HTTP 401 Unauthorized. Credentials or model access are not accepted.',
      fix: 'Check the provider API key, model access, and environment variables before retrying.',
    });
    expect(classifyAIProviderHttpFailure('OpenAI', 429, 'Too Many Requests', 120000)).toMatchObject(
      {
        kind: 'rate-limit',
        retryable: true,
        retryAfterMs: 120000,
        fix: 'Retry later or reduce request frequency/input size. Wait at least 120000ms before retrying.',
      }
    );
    expect(classifyAIProviderHttpFailure('OpenAI', 500, 'Server Error')).toMatchObject({
      kind: 'server',
      retryable: true,
    });
    expect(classifyAIProviderHttpFailure('OpenAI', 400, 'Bad Request')).toMatchObject({
      kind: 'bad-request',
      retryable: false,
    });
  });

  it('parses Retry-After values and keeps provider summaries safe', () => {
    expect(parseRetryAfterHeaderMs('2.5')).toBe(2500);
    expect(parseRetryAfterHeaderMs('invalid')).toBeUndefined();
    expect(
      classifyAIProviderHttpFailure('OpenAI', 500, `Server Error\n${'x'.repeat(120)}`).safeSummary
    ).toBe(`OpenAI returned HTTP 500 Server Error ${'x'.repeat(67)}...`);
  });

  it('maps OpenAI transport failures to actionable errors', async () => {
    await expect(
      askAI({
        provider: 'openai',
        prompt: 'Explain ZaoWu',
        allowNetwork: true,
        env: {
          OPENAI_API_KEY: 'test-key',
        },
        fetcher: async () => {
          throw new Error('network unavailable');
        },
      })
    ).rejects.toThrow('AI provider request failed.');
  });

  it('rejects OpenAI responses without text output', async () => {
    await expect(
      askAI({
        provider: 'openai',
        prompt: 'Explain ZaoWu',
        allowNetwork: true,
        env: {
          OPENAI_API_KEY: 'test-key',
        },
        fetcher: async () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          async json() {
            return await readOpenAIFixture('openai-no-text-output');
          },
        }),
      })
    ).rejects.toThrow('AI provider response is invalid.');
  });

  it('rejects unknown providers', () => {
    expect(() => getAIProvider('missing')).toThrow('AI provider not found: missing.');
  });
});
