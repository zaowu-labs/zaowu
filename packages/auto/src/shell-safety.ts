/** Returns a reason when a shell command matches a high-risk execution pattern. */
export function checkShellSafety(command: string): string | undefined {
  const normalized = command.toLowerCase().trim();
  if (/\brm\s+-[a-z]*[rf]/i.test(normalized) || /\brm\s+--(recursive|force)/i.test(normalized))
    return 'Dangerous command pattern found: `rm` with recursive/force flags.';
  if (
    /\b(del|erase|rd|rmdir)\b/i.test(normalized) &&
    // (?:^|\s) instead of \b: a word boundary can never precede a leading `-`
    // (both sides are non-word characters), which silently disabled this rule.
    (/\/[a-z]*s/i.test(normalized) || /(?:^|\s)-(recurse|s)\b/i.test(normalized))
  )
    return 'Dangerous command pattern found: recursive deletion (`del`, `rd`, or `rmdir` with `/s` or `-recurse`).';
  if (/\bformat\s+[a-z]:/i.test(normalized))
    return 'Dangerous command pattern found: disk formatting (`format`).';
  if (/\bsudo\b/i.test(normalized))
    return 'Dangerous command pattern found: execution with administrative privileges (`sudo`).';
  if (/\bchmod\b/i.test(normalized))
    return 'Dangerous command pattern found: modifying file permissions (`chmod`).';
  if (/\bchown\b/i.test(normalized))
    return 'Dangerous command pattern found: changing file ownership (`chown`).';
  if (
    /\|\s*(sh|bash|zsh|fish|cmd|powershell|pwsh|iex)\b/i.test(normalized) ||
    /\biex\b/i.test(normalized) ||
    /\binvoke-expression\b/i.test(normalized)
  )
    return 'Dangerous command pattern found: piped shell execution or dynamic command evaluation.';
  if (
    /\bbase64\b/i.test(normalized) &&
    (/\|\s*(sh|bash|zsh|fish|cmd|powershell|pwsh|iex)\b/i.test(normalized) ||
      // (?:^|\s) instead of \b: a word boundary can never precede a leading
      // `-`, so the flag-only variants of this rule never fired.
      /(?:^|\s)--decode\b/i.test(normalized) ||
      /(?:^|\s)-d\b/i.test(normalized))
  )
    return 'Dangerous command pattern found: decoding base64 payload into shell execution.';
  if (/\/dev\/(tcp|udp)\//i.test(normalized))
    return 'Dangerous command pattern found: network redirect / reverse shell redirection (`/dev/tcp` or `/dev/udp`).';
  if (/\b(nc|netcat|ncat)\b/i.test(normalized) && /\s+-e\b/i.test(normalized))
    return 'Dangerous command pattern found: netcat executable execution flag (`-e` redirection).';
  if (/\b(bash|sh|zsh|dash|ksh)\s+-i\b/i.test(normalized))
    return 'Dangerous command pattern found: interactive shell spawn (`-i` flag).';
  if (
    /\b(curl|wget)\b/i.test(normalized) &&
    /\b(sh|bash|zsh|cmd|powershell|pwsh)\b/i.test(normalized) &&
    (/\.sh\b/i.test(normalized) || /\.ps1\b/i.test(normalized) || /\.bat\b/i.test(normalized))
  )
    return 'Dangerous command pattern found: download and sequential script execution.';
  if (/>>?\s*([/\\]etc[/\\]|c:[/\\]windows[/\\])/i.test(normalized))
    return 'Dangerous command pattern found: write redirection to sensitive system directory.';
  if (/\btee\b.*([/\\]etc[/\\]|c:[/\\]windows[/\\])/i.test(normalized))
    return 'Dangerous command pattern found: writing to sensitive system path using tee.';
  return undefined;
}
