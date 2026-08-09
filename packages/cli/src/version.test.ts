import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getCliVersion } from './version';

describe('getCliVersion', () => {
  it('reports the version from the CLI package manifest', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as { version: string };

    expect(getCliVersion()).toBe(packageJson.version);
    expect(getCliVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
