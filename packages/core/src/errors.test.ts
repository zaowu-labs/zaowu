import { describe, expect, it } from 'vitest';
import { ZaoWuError } from './errors';

describe('ZaoWuError', () => {
  it('formats expected errors for human-readable output', () => {
    const error = new ZaoWuError({
      code: 'NO_STAGED_CHANGES',
      message: 'No staged changes found.',
      why: '`zw dev commit` reads staged Git changes by default.',
      fix: 'Run `git add .` and try again.',
    });

    expect(error.formatHuman()).toBe(`Error: No staged changes found.

Why:
\`zw dev commit\` reads staged Git changes by default.

How to fix:
Run \`git add .\` and try again.`);
  });

  it('formats expected errors for JSON output', () => {
    const error = new ZaoWuError({
      code: 'NO_STAGED_CHANGES',
      message: 'No staged changes found.',
      exitCode: 2,
    });

    expect(JSON.parse(error.formatJSON())).toEqual({
      error: {
        code: 'NO_STAGED_CHANGES',
        message: 'No staged changes found.',
        why: null,
        fix: null,
        exitCode: 2,
      },
    });
  });
});
