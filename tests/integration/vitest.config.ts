import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.int.test.ts'],
    hookTimeout: 60_000,
    testTimeout: 120_000,
  },
});
