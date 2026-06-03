import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AI_DOMAIN,
  askAI,
  getAIProvider,
  listAIProviders,
  validateAIProviderConfig,
} from './index';

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
      },
    ]);
  });

  it('defines the AI domain boundary', () => {
    expect(AI_DOMAIN.name).toBe('ai');
    expect(AI_DOMAIN.commands.map((command) => command.name)).toEqual(['ask', 'providers']);
  });

  it('answers through the local echo provider without network access', async () => {
    await expect(askAI({ prompt: 'Explain ZaoWu' })).resolves.toMatchObject({
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

  it('rejects unknown providers', () => {
    expect(() => getAIProvider('missing')).toThrow('AI provider not found: missing.');
  });
});
