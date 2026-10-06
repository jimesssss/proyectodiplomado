import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: Object.fromEntries(['permissions','types','shared-types','validation','config','utils','api-client'].map(name => ['@erp/'+name, fileURLToPath(new URL('./packages/'+name+'/src/index.ts', import.meta.url))])) },
  test: {
    globals: true,
    poolOptions: { threads: { minThreads: 1, maxThreads: 1 } },
    hookTimeout: 60_000,
    setupFiles: ['./tests/setup/mobile-native.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['apps/*/src/**/*.ts', 'packages/*/src/**/*.ts'],
      exclude: [
        'node_modules/',
        'apps/*/dist',
        'packages/*/dist',
        '**/*.test.ts',
        '**/*.d.ts',
      ],
    },
  },
});
