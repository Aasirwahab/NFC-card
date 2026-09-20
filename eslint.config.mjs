import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * CI gate 3 (spec §25.2): no raw `fetch` outside `lib/http`.
 *
 * Bringing the enrichment pipeline in-house moved the outbound fetch onto our own
 * server, inside the perimeter, in a process holding the service-role key. Every
 * outbound request must go through `safeFetch` (§22.4), and that is enforced here
 * rather than left to code review.
 */
const banRawFetch = {
  'no-restricted-globals': [
    'error',
    {
      name: 'fetch',
      message: 'Use safeFetch from @/lib/http instead. See spec §22.4 (SSRF guard).',
    },
  ],
  'no-restricted-properties': [
    'error',
    {
      object: 'globalThis',
      property: 'fetch',
      message: 'Use safeFetch from @/lib/http instead. See spec §22.4 (SSRF guard).',
    },
    {
      object: 'window',
      property: 'fetch',
      message: 'Use safeFetch from @/lib/http instead. See spec §22.4 (SSRF guard).',
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'coverage/**']),
  {
    rules: banRawFetch,
  },
  {
    // The one place allowed to touch the network directly.
    files: ['lib/http/**'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },
  {
    // Client components legitimately call our own same-origin API routes; those are
    // not the SSRF surface. They go through lib/http/client.ts, which is browser-only.
    files: ['tests/**', 'scripts/**'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },
]);

export default eslintConfig;
