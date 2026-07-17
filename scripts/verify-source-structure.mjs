/* global console, process */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('packages');
const maxProductionLines = 1_000;

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(target) : [target];
    })
  );
  return nested.flat();
};

const files = (await walk(root)).filter(
  (file) =>
    file.includes(`${path.sep}src${path.sep}`) &&
    file.endsWith('.ts') &&
    !file.endsWith('.test.ts') &&
    !file.endsWith('.d.ts')
);

const oversized = [];
for (const file of files) {
  const content = await readFile(file, 'utf8');
  const lines = content === '' ? 0 : content.split(/\r?\n/).length;
  if (lines > maxProductionLines) {
    oversized.push({ file: path.relative(process.cwd(), file), lines });
  }
}

if (oversized.length > 0) {
  console.error(`Production source files must stay at or below ${maxProductionLines} lines.`);
  for (const { file, lines } of oversized) console.error(`- ${file}: ${lines} lines`);
  console.error(
    'Split by domain responsibility (contracts, parsing, policy, execution, or presentation).'
  );
  process.exitCode = 1;
} else {
  console.log(
    `Source structure verified: ${files.length} production TypeScript files, max ${maxProductionLines} lines.`
  );
}
