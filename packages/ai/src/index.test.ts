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
  resolveAIProviderNetworkTarget,
  resolveAIModel,
  validateAIProviderConfig,
} from './index';

const readAIFixture = async (name: string): Promise<unknown> =>
  JSON.parse(
    await readFile(new URL(`../test/fixtures/${name}.json`, import.meta.url), 'utf8')
  ) as unknown;

describe('AI provider registry', () => {
  it('marks every HTTP-backed provider as networked', () => {
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
      {
        id: 'ollama',
        name: 'Ollama (Local)',
        network: true,
        configured: true,
        requiredEnv: [],
        defaultModel: 'llama3',
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        network: true,
        configured: false,
        requiredEnv: ['ANTHROPIC_API_KEY'],
        defaultModel: 'claude-sonnet-4-6',
      },
    ]);
  });

  it('asks Ollama through the generate API', async () => {
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
        provider: 'ollama',
        prompt: 'Explain ZaoWu',
        model: 'test-model',
        allowNetwork: true,
        fetcher: async (url, init) => {
          calls.push({ url, init });

          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            async json() {
              return await readAIFixture('ollama-generate');
            },
          };
        },
      })
    ).resolves.toMatchObject({
      schemaVersion: 1,
      provider: {
        id: 'ollama',
        network: true,
        configured: true,
      },
      model: 'test-model',
      endpoint: 'http://localhost:11434/api/generate',
      output: 'Ollama response text',
      usage: null,
    });

    expect(calls).toEqual([
      {
        url: 'http://localhost:11434/api/generate',
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: expect.any(AbortSignal),
          redirect: 'error',
          body: JSON.stringify({
            model: 'test-model',
            prompt: 'Explain ZaoWu',
            stream: false,
          }),
        },
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
      endpoint: null,
      input: {
        source: 'prompt',
        promptCharacters: 13,
      },
      output: expect.stringContaining('Explain ZaoWu'),
      usage: null,
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

  it('resolves AI models consistently for preview and provider requests', () => {
    const openai = listAIProviders({ OPENAI_API_KEY: 'test-key' }).find(
      (provider) => provider.id === 'openai'
    );
    const echo = listAIProviders({}).find((provider) => provider.id === 'echo');

    expect(openai).toBeDefined();
    expect(echo).toBeDefined();
    expect(resolveAIModel(openai!, { model: '  request-model  ' })).toBe('request-model');
    expect(resolveAIModel(openai!, { env: { OPENAI_MODEL: '  env-model  ' } })).toBe('env-model');
    expect(resolveAIModel(openai!, { env: {} })).toBe('gpt-4.1-mini');
    expect(resolveAIModel(echo!, { env: {} })).toBe('echo-local');
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
        endpoint: 'https://api.openai.com/v1/responses',
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
        usage: null,
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

  it('rejects empty file-only AI input before provider execution', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zaowu-ai-'));
    const filePath = path.join(root, 'empty.md');

    await writeFile(filePath, '', 'utf8');

    try {
      await expect(askAI({ prompt: '', filePath })).rejects.toThrow('AI prompt is required.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
              return {
                output_text: 'ZaoWu is a toolkit.',
                usage: {
                  input_tokens: 7,
                  output_tokens: 5,
                  total_tokens: 12,
                },
              };
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
      endpoint: 'https://api.openai.com/v1/responses',
      output: 'ZaoWu is a toolkit.',
      usage: {
        inputTokens: 7,
        outputTokens: 5,
        totalTokens: 12,
      },
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
          redirect: 'error',
          body: JSON.stringify({
            model: 'test-model',
            input: 'Explain ZaoWu',
          }),
        },
      },
    ]);
  });

  it('uses the same trimmed model resolution for preview and confirmed OpenAI requests', async () => {
    let requestBody: unknown;

    const preview = await previewAIRequest({
      provider: 'openai',
      prompt: 'Explain ZaoWu',
      model: '  custom-model  ',
      env: {
        OPENAI_API_KEY: 'test-key',
        OPENAI_MODEL: '  env-model  ',
      },
    });

    const response = await askAI({
      provider: 'openai',
      prompt: 'Explain ZaoWu',
      model: '  custom-model  ',
      allowNetwork: true,
      env: {
        OPENAI_API_KEY: 'test-key',
        OPENAI_MODEL: '  env-model  ',
      },
      fetcher: async (_url, init) => {
        requestBody = JSON.parse(init.body);

        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          async json() {
            return await readAIFixture('openai-output-text');
          },
        };
      },
    });

    expect(preview.model).toBe('custom-model');
    expect(response.model).toBe('custom-model');
    expect(requestBody).toMatchObject({
      model: 'custom-model',
    });
  });

  it('uses trimmed OPENAI_MODEL when no request model is provided', async () => {
    let requestBody: unknown;

    const preview = await previewAIRequest({
      provider: 'openai',
      prompt: 'Explain ZaoWu',
      env: {
        OPENAI_API_KEY: 'test-key',
        OPENAI_MODEL: '  env-model  ',
      },
    });

    const response = await askAI({
      provider: 'openai',
      prompt: 'Explain ZaoWu',
      allowNetwork: true,
      env: {
        OPENAI_API_KEY: 'test-key',
        OPENAI_MODEL: '  env-model  ',
      },
      fetcher: async (_url, init) => {
        requestBody = JSON.parse(init.body);

        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          async json() {
            return await readAIFixture('openai-output-text');
          },
        };
      },
    });

    expect(preview.model).toBe('env-model');
    expect(response.model).toBe('env-model');
    expect(requestBody).toMatchObject({
      model: 'env-model',
    });
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
            return await readAIFixture('openai-nested-output');
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

  it('requires explicit confirmation before contacting Ollama', async () => {
    await expect(
      askAI({
        provider: 'ollama',
        prompt: 'Explain ZaoWu',
        fetcher: async () => {
          throw new Error('fetcher should not be called');
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

  it('keeps provider HTTP errors free of secret values', async () => {
    const error = await askAI({
      provider: 'openai',
      prompt: 'Explain ZaoWu',
      allowNetwork: true,
      env: {
        OPENAI_API_KEY: 'secret-test-key',
      },
      fetcher: async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        async json() {
          return {
            error: {
              message: 'bad key secret-test-key',
            },
          };
        },
      }),
    }).catch((caught: unknown) => caught);

    const rendered = [
      error instanceof Error ? error.message : '',
      typeof error === 'object' && error && 'why' in error ? String(error.why) : '',
      typeof error === 'object' && error && 'fix' in error ? String(error.fix) : '',
    ].join('\n');

    expect(rendered).toContain('AI provider request failed');
    expect(rendered).not.toContain('secret-test-key');
    expect(rendered).not.toContain('bad key');
  });

  it('includes provider retry-after hints in request failure fixes', async () => {
    const error = await askAI({
      provider: 'openai',
      prompt: 'Explain ZaoWu',
      allowNetwork: true,
      env: {
        OPENAI_API_KEY: 'test-key',
      },
      fetcher: async () => ({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          get(name: string) {
            return name.toLowerCase() === 'retry-after' ? '2' : null;
          },
        },
        async json() {
          return {};
        },
      }),
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      message: 'AI provider request failed.',
      fix: 'Retry later or reduce request frequency/input size. Wait at least 2000ms before retrying.',
    });
  });

  it('keeps the provider HTTP failure classification matrix stable', () => {
    const matrix = [
      { status: 401, statusText: 'Unauthorized' },
      { status: 408, statusText: 'Request Timeout', retryAfterMs: 3000 },
      { status: 429, statusText: 'Too Many Requests', retryAfterMs: 120000 },
      { status: 500, statusText: 'Server Error' },
      { status: 400, statusText: 'Bad Request' },
    ].map(({ status, statusText, retryAfterMs }) =>
      classifyAIProviderHttpFailure('OpenAI', status, statusText, retryAfterMs)
    );

    expect(matrix).toEqual([
      {
        kind: 'auth',
        retryable: false,
        safeSummary: 'OpenAI returned HTTP 401 Unauthorized.',
        why: 'OpenAI returned HTTP 401 Unauthorized. Credentials or model access are not accepted.',
        fix: 'Check the provider API key, model access, and environment variables before retrying.',
      },
      {
        kind: 'timeout',
        retryable: true,
        safeSummary: 'OpenAI returned HTTP 408 Request Timeout.',
        retryAfterMs: 3000,
        why: 'OpenAI returned HTTP 408 Request Timeout. The provider timed out before completing the request.',
        fix: 'Retry later, reduce input size, or increase the timeout if the request is expected to take longer. Wait at least 3000ms before retrying.',
      },
      {
        kind: 'rate-limit',
        retryable: true,
        safeSummary: 'OpenAI returned HTTP 429 Too Many Requests.',
        retryAfterMs: 120000,
        why: 'OpenAI returned HTTP 429 Too Many Requests. The request was rate-limited.',
        fix: 'Retry later or reduce request frequency/input size. Wait at least 120000ms before retrying.',
      },
      {
        kind: 'server',
        retryable: true,
        safeSummary: 'OpenAI returned HTTP 500 Server Error.',
        why: 'OpenAI returned HTTP 500 Server Error. The provider did not complete the request.',
        fix: 'Check provider status and retry later.',
      },
      {
        kind: 'bad-request',
        retryable: false,
        safeSummary: 'OpenAI returned HTTP 400 Bad Request.',
        why: 'OpenAI returned HTTP 400 Bad Request. The request was rejected.',
        fix: 'Check the model, input size, and provider request settings before retrying.',
      },
    ]);
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
            return await readAIFixture('openai-no-text-output');
          },
        }),
      })
    ).rejects.toThrow('AI provider response is invalid.');
  });

  it('rejects non-object OpenAI responses', async () => {
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
            return 'not an object';
          },
        }),
      })
    ).rejects.toThrow('AI provider response is invalid.');
  });

  it('maps invalid OpenAI JSON bodies to stable provider response errors', async () => {
    const error = await askAI({
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
          throw new SyntaxError('Unexpected token');
        },
      }),
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: 'AI_PROVIDER_RESPONSE_INVALID',
      message: 'AI provider response is invalid.',
      why: 'OpenAI returned a successful HTTP response, but the response body was not valid JSON.',
    });
  });

  it('rejects unknown providers', () => {
    expect(() => getAIProvider('missing')).toThrow('AI provider not found: missing.');
  });

  it('asks Anthropic through the Messages API', async () => {
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
        provider: 'anthropic',
        prompt: 'Explain ZaoWu',
        model: 'claude-test',
        allowNetwork: true,
        env: {
          ANTHROPIC_API_KEY: 'anthropic-test-key',
        },
        fetcher: async (url, init) => {
          calls.push({ url, init });

          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            async json() {
              return await readAIFixture('anthropic-message');
            },
          };
        },
      })
    ).resolves.toMatchObject({
      schemaVersion: 1,
      provider: {
        id: 'anthropic',
        network: true,
        configured: true,
      },
      model: 'claude-test',
      endpoint: 'https://api.anthropic.com/v1/messages',
      output: 'Anthropic response text',
      usage: {
        inputTokens: 12,
        outputTokens: 4,
        totalTokens: 16,
      },
    });

    expect(calls).toEqual([
      {
        url: 'https://api.anthropic.com/v1/messages',
        init: {
          method: 'POST',
          headers: {
            'x-api-key': 'anthropic-test-key',
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          signal: expect.any(AbortSignal),
          redirect: 'error',
          body: JSON.stringify({
            model: 'claude-test',
            messages: [{ role: 'user', content: 'Explain ZaoWu' }],
            max_tokens: 4096,
            stream: false,
          }),
        },
      },
    ]);
  });

  it('keeps Ollama on the non-streaming foundation path', async () => {
    const chunks: string[] = [];
    const onChunk = (chunk: string) => {
      chunks.push(chunk);
    };

    const result = await askAI({
      provider: 'ollama',
      prompt: 'Explain ZaoWu',
      allowNetwork: true,
      onChunk,
      fetcher: async (_url, _init) => {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          async json() {
            return {
              response: 'Ollama streamed text',
            };
          },
        };
      },
    });

    expect(result.output).toBe('Ollama streamed text');
    expect(chunks).toEqual([]);
  });

  it('keeps OpenAI on the non-streaming foundation path', async () => {
    const chunks: string[] = [];
    const onChunk = (chunk: string) => {
      chunks.push(chunk);
    };

    const result = await askAI({
      provider: 'openai',
      prompt: 'Explain ZaoWu',
      allowNetwork: true,
      onChunk,
      env: {
        OPENAI_API_KEY: 'test-key',
      },
      fetcher: async (_url, _init) => {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: 'OpenAI streamed text',
                  },
                },
              ],
            };
          },
        };
      },
    });

    expect(result.output).toBe('OpenAI streamed text');
    expect(chunks).toEqual([]);
  });

  it('rejects empty OpenAI choice text as invalid provider output', async () => {
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
            return {
              choices: [
                {
                  message: {
                    content: '   ',
                  },
                },
              ],
            };
          },
        }),
      })
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_RESPONSE_INVALID',
    });
  });

  it('supports custom OPENAI_BASE_URL endpoint', async () => {
    let requestedUrl = '';
    await askAI({
      provider: 'openai',
      prompt: 'Explain ZaoWu',
      allowNetwork: true,
      env: {
        OPENAI_API_KEY: 'test-key',
        OPENAI_BASE_URL: 'https://my-custom-proxy.internal',
      },
      fetcher: async (url, _init) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          async json() {
            return {
              choices: [{ message: { content: 'Custom OpenAI Response' } }],
            };
          },
        };
      },
    });
    expect(requestedUrl).toBe('https://my-custom-proxy.internal/v1/responses');
  });

  it('returns undefined for unknown provider ids, including prototype-chain keys', () => {
    for (const providerId of [
      'unknown',
      'toString',
      'constructor',
      '__proto__',
      'hasOwnProperty',
    ]) {
      expect(resolveAIProviderNetworkTarget(providerId, {})).toBeUndefined();
    }
  });

  it('rejects provider base URLs with query strings or fragments', () => {
    for (const [provider, env] of [
      ['openai', { OPENAI_BASE_URL: 'https://my-custom-proxy.internal?tenant=demo' }],
      ['ollama', { OLLAMA_HOST: 'http://localhost:11434?tenant=demo' }],
      ['anthropic', { ANTHROPIC_BASE_URL: 'https://my-anthropic-proxy.internal#messages' }],
    ] as const) {
      let thrown: unknown;

      try {
        resolveAIProviderNetworkTarget(provider, env);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toMatchObject({
        code: 'AI_PROVIDER_REQUEST_FAILED',
        why: expect.stringContaining(
          'must use http or https and must not contain credentials, a query string, or a fragment'
        ),
      });
    }
  });

  it('supports custom ANTHROPIC_BASE_URL endpoint', async () => {
    let requestedUrl = '';
    await askAI({
      provider: 'anthropic',
      prompt: 'Explain ZaoWu',
      allowNetwork: true,
      env: {
        ANTHROPIC_API_KEY: 'test-key',
        ANTHROPIC_BASE_URL: 'https://my-anthropic-proxy.internal/',
      },
      fetcher: async (url, _init) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          async json() {
            return {
              content: [{ type: 'text', text: 'Custom Anthropic Response' }],
            };
          },
        };
      },
    });
    expect(requestedUrl).toBe('https://my-anthropic-proxy.internal/v1/messages');
  });

  it('joins multiple Anthropic text blocks with newlines', async () => {
    await expect(
      askAI({
        provider: 'anthropic',
        prompt: 'Explain ZaoWu',
        allowNetwork: true,
        env: {
          ANTHROPIC_API_KEY: 'test-key',
        },
        fetcher: async () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          async json() {
            return {
              content: [
                { type: 'text', text: 'First block.' },
                { type: 'thinking', thinking: 'not returned' },
                { type: 'text', text: 'Second block.' },
              ],
            };
          },
        }),
      })
    ).resolves.toMatchObject({
      output: 'First block.\nSecond block.',
    });
  });

  it('rejects Anthropic responses without text output', async () => {
    await expect(
      askAI({
        provider: 'anthropic',
        prompt: 'Explain ZaoWu',
        allowNetwork: true,
        env: {
          ANTHROPIC_API_KEY: 'test-key',
        },
        fetcher: async () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          async json() {
            return await readAIFixture('anthropic-no-text-output');
          },
        }),
      })
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_RESPONSE_INVALID',
      why: 'The response from Anthropic did not contain generated text.',
    });
  });

  it('retries on rate limits (429) or server errors (500) and eventually succeeds or fails', async () => {
    let callsCount = 0;
    const result = await askAI({
      provider: 'openai',
      prompt: 'Explain ZaoWu',
      allowNetwork: true,
      env: {
        OPENAI_API_KEY: 'test-key',
      },
      fetcher: async (_url, _init) => {
        callsCount++;
        if (callsCount < 3) {
          return {
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            headers: {
              get(name: string) {
                if (name === 'retry-after') return '0.01'; // wait 10ms
                return null;
              },
            },
            async json() {
              return {};
            },
          };
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          async json() {
            return {
              choices: [{ message: { content: 'Success after retry' } }],
            };
          },
        };
      },
    });

    expect(callsCount).toBe(3);
    expect(result.output).toBe('Success after retry');
  });
});
