import { describe, expect, it } from 'vitest';
import { listAIProviders } from './index';

describe('AI provider registry', () => {
  it('starts empty until provider support is implemented', () => {
    expect(listAIProviders()).toEqual([]);
  });
});
