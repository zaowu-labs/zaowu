/**
 * ZaoWuError is the standard error type for ZaoWu
 * All expected errors should use this type
 */
export class ZaoWuError extends Error {
  public readonly code: string;
  public readonly why?: string;
  public readonly fix?: string;
  public readonly exitCode: number;

  constructor(options: {
    code: string;
    message: string;
    why?: string;
    fix?: string;
    exitCode?: number;
  }) {
    super(options.message);
    this.name = 'ZaoWuError';
    this.code = options.code;
    this.why = options.why;
    this.fix = options.fix;
    this.exitCode = options.exitCode ?? 1;
  }

  /**
   * Format error for human-readable output
   */
  formatHuman(): string {
    let output = `❌ ${this.message}`;

    if (this.why) {
      output += `\n\nWhy: ${this.why}`;
    }

    if (this.fix) {
      output += `\n\nHow to fix: ${this.fix}`;
    }

    if (this.code) {
      output += `\n\nError code: ${this.code}`;
    }

    return output;
  }

  /**
   * Format error for JSON output
   */
  formatJSON(): string {
    return JSON.stringify({
      code: this.code,
      message: this.message,
      why: this.why,
      fix: this.fix,
      exitCode: this.exitCode,
    });
  }
}
