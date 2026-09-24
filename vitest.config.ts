import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
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
