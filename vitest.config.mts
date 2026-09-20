import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Honours the "@/*" paths in tsconfig.json natively.
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The in-process Postgres used by the integration tests takes a moment to boot.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
