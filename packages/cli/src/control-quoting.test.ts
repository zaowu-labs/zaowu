import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { formatConfirmCommand } from './handler-utils';

describe('copyable safe control arguments', () => {
  it.each(["Text '\\ \u001b[2J\u009d52;data\u0007", 'Names \u202evalue\nNew line\tTab'])(
    'round-trips encoded argument %# without active escapes',
    (value) => {
      const directory = mkdtempSync(path.join(os.tmpdir(), 'zaowu-control-quote-'));
      const target = path.join(directory, 'argument.txt');
      const command = formatConfirmCommand([
        'node',
        '-e',
        "require('node:fs').writeFileSync(process.argv[1], process.argv[2])",
        '--',
        target,
        value,
      ]);
      expect(command).not.toContain('\u001b');
      expect(command).not.toContain('\u202e');
      const windows = process.platform === 'win32';
      try {
        execFileSync(
          windows ? 'pwsh' : '/bin/sh',
          windows ? ['-NoProfile', '-Command', command] : ['-c', command],
          { encoding: 'utf8', timeout: 10000, windowsHide: true }
        );
        expect(readFileSync(target, 'utf8')).toBe(value);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  );
});
