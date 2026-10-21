/* global console, process */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { evaluateProductionAudit } from './production-audit-policy.mjs';

const policy = JSON.parse(
  readFileSync(new URL('../docs/security/dependency-exceptions.json', import.meta.url), 'utf8')
);
const command = process.platform === 'win32' ? 'cmd.exe' : 'corepack';
const args =
  process.platform === 'win32'
    ? ['/d', '/s', '/c', 'corepack', 'pnpm', 'audit', '--prod', '--json']
    : ['pnpm', 'audit', '--prod', '--json'];
let output;
try {
  output = execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024,
  });
} catch (error) {
  if (error.status !== 1 || !error.stdout) throw error;
  output = error.stdout;
}
const { accepted, rejected } = evaluateProductionAudit(JSON.parse(output), policy.exceptions);

for (const { advisory, exception } of accepted) {
  console.log(
    `Reviewed exception: ${advisory.github_advisory_id}, ${exception.path}, expires ${exception.expiresOn}.`
  );
}
for (const { advisory } of rejected) {
  console.error(
    `Blocked: ${advisory.github_advisory_id ?? advisory.id}, ${advisory.module_name}, ${advisory.severity}. ${advisory.url ?? ''}`
  );
}
if (rejected.length > 0) process.exitCode = 1;
else
  console.log(
    `Production audit policy: ok (${accepted.length} visible, time-limited exception(s)).`
  );
