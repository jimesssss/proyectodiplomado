import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'apps/*/src/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/security/**/*.test.ts',
    ],
    environment: 'node',
    reporters: ['default'],
    // Suites de integración con argon2 (hash caro) y mongodb-memory-server en
    // paralelo superan los 5s por test bajo carga: se sube el timeout global
    // (los fallos por aserción siguen siendo inmediatos).
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
