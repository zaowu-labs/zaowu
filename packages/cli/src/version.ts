import { readFileSync } from 'node:fs';

const FALLBACK_VERSION = '0.0.1';

export const getCliVersion = (): string => {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as { version?: unknown };

    return typeof packageJson.version === 'string' && packageJson.version
      ? packageJson.version
      : FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
};
