import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Honours the "@/*" paths in tsconfig.json natively.
    tsconfigPaths: true,
    alias: {
      // See tests/support/server-only.ts.
      'server-only': fileURLToPath(new URL('./tests/support/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The in-process Postgres used by the integration tests takes a moment to boot.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
