import { describe, expect, it } from 'vitest';
import { AI_DOMAIN, listAIProviders } from './index';

describe('AI provider registry', () => {
  it('starts empty until provider support is implemented', () => {
    expect(listAIProviders()).toEqual([]);
  });

  it('defines the AI domain boundary', () => {
    expect(AI_DOMAIN.name).toBe('ai');
    expect(AI_DOMAIN.commands.map((command) => command.name)).toEqual(['ask']);
  });
});
