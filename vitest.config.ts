import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@zaowu/ai': path.resolve(rootDirectory, 'packages/ai/src/index.ts'),
      '@zaowu/auto': path.resolve(rootDirectory, 'packages/auto/src/index.ts'),
      '@zaowu/config': path.resolve(rootDirectory, 'packages/config/src/index.ts'),
      '@zaowu/core': path.resolve(rootDirectory, 'packages/core/src/index.ts'),
      '@zaowu/data': path.resolve(rootDirectory, 'packages/data/src/index.ts'),
      '@zaowu/dev': path.resolve(rootDirectory, 'packages/dev/src/index.ts'),
      '@zaowu/doc': path.resolve(rootDirectory, 'packages/doc/src/index.ts'),
      '@zaowu/plugin': path.resolve(rootDirectory, 'packages/plugin/src/index.ts'),
      '@zaowu/teach': path.resolve(rootDirectory, 'packages/teach/src/index.ts'),
      '@zaowu/web': path.resolve(rootDirectory, 'packages/web/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    include: ['packages/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts'],
    },
  },
});
