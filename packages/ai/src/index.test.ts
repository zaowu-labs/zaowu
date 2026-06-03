import { describe, expect, it } from 'vitest';
import { AI_DOMAIN, askAI, getAIProvider, listAIProviders } from './index';

describe('AI provider registry', () => {
  it('starts with a local echo provider', () => {
    expect(listAIProviders()).toEqual([
      {
        id: 'echo',
        name: 'Local Echo',
        network: false,
      },
    ]);
  });

  it('defines the AI domain boundary', () => {
    expect(AI_DOMAIN.name).toBe('ai');
    expect(AI_DOMAIN.commands.map((command) => command.name)).toEqual(['ask']);
  });

  it('answers through the local echo provider without network access', async () => {
    await expect(askAI({ prompt: 'Explain ZaoWu' })).resolves.toMatchObject({
      provider: {
        id: 'echo',
      },
      model: 'echo-local',
      output: expect.stringContaining('Explain ZaoWu'),
    });
  });

  it('rejects unknown providers', () => {
    expect(() => getAIProvider('missing')).toThrow('AI provider not found: missing.');
  });
});
