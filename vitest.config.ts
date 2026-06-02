import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@zaowu/ai': path.resolve(rootDirectory, 'packages/ai/src/index.ts'),
      '@zaowu/config': path.resolve(rootDirectory, 'packages/config/src/index.ts'),
      '@zaowu/core': path.resolve(rootDirectory, 'packages/core/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts'],
    },
  },
});
