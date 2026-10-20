/* global console, process */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
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

if (accepted.length > 0) {
  // This exception is valid only for the reviewed Mammoth library entry point.
  // Fail if a future change loads its standalone argument-parser dependency.
  const require = createRequire(new URL('../packages/doc/package.json', import.meta.url));
  const mammothPackage = require('mammoth/package.json');
  if (mammothPackage.version !== policy.mammothVersion) {
    throw new Error('Mammoth version changed; the dependency exception needs a new review.');
  }
  const entry = require.resolve('mammoth');
  require(entry);
  const visited = new Set();
  const inspect = (module) => {
    if (!module || visited.has(module.id)) return;
    visited.add(module.id);
    if (/(?:^|[/\\])(?:argparse|sprintf-js)(?:[/\\]|$)/.test(module.filename)) {
      throw new Error('Mammoth library now loads an excepted CLI dependency; release is blocked.');
    }
    for (const child of module.children) inspect(child);
  };
  inspect(require.cache[entry]);
}
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
