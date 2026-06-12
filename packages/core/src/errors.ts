import type { ZaoWuErrorCode } from './error-codes.js';

export interface ZaoWuErrorOptions {
  code: ZaoWuErrorCode;
  message: string;
  why?: string;
  fix?: string;
  exitCode?: number;
}

export interface ZaoWuErrorJSON {
  code: ZaoWuErrorCode;
  message: string;
  why: string | null;
  fix: string | null;
  exitCode: number;
}

export class ZaoWuError extends Error {
  public readonly code: ZaoWuErrorCode;
  public readonly why?: string;
  public readonly fix?: string;
  public readonly exitCode: number;

  constructor(options: ZaoWuErrorOptions) {
    super(options.message);
    this.name = 'ZaoWuError';
    this.code = options.code;
    this.why = options.why;
    this.fix = options.fix;
    this.exitCode = options.exitCode ?? 1;
  }

  formatHuman(): string {
    const sections = [`Error: ${this.message}`];

    if (this.why) {
      sections.push(`Why:\n${this.why}`);
    }

    if (this.fix) {
      sections.push(`How to fix:\n${this.fix}`);
    }

    return sections.join('\n\n');
  }

  toJSON(): ZaoWuErrorJSON {
    return {
      code: this.code,
      message: this.message,
      why: this.why ?? null,
      fix: this.fix ?? null,
      exitCode: this.exitCode,
    };
  }

  formatJSON(): string {
    return JSON.stringify({
      error: this.toJSON(),
    });
  }
}

export const isZaoWuError = (error: unknown): error is ZaoWuError => error instanceof ZaoWuError;
