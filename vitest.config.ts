import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@zaowu-labs/ai': path.resolve(rootDirectory, 'packages/ai/src/index.ts'),
      '@zaowu-labs/auto': path.resolve(rootDirectory, 'packages/auto/src/index.ts'),
      '@zaowu-labs/config': path.resolve(rootDirectory, 'packages/config/src/index.ts'),
      '@zaowu-labs/core': path.resolve(rootDirectory, 'packages/core/src/index.ts'),
      '@zaowu-labs/data': path.resolve(rootDirectory, 'packages/data/src/index.ts'),
      '@zaowu-labs/dev': path.resolve(rootDirectory, 'packages/dev/src/index.ts'),
      '@zaowu-labs/doc': path.resolve(rootDirectory, 'packages/doc/src/index.ts'),
      '@zaowu-labs/plugin': path.resolve(rootDirectory, 'packages/plugin/src/index.ts'),
      '@zaowu-labs/teach': path.resolve(rootDirectory, 'packages/teach/src/index.ts'),
      '@zaowu-labs/web': path.resolve(rootDirectory, 'packages/web/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    include: ['packages/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts'],
      // Floor thresholds: current package coverage sits at 81-95% lines, so
      // these fail the run only when coverage regresses meaningfully.
      thresholds: {
        lines: 80,
        functions: 60,
        branches: 70,
        statements: 80,
      },
    },
  },
});
