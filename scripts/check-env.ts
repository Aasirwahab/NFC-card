/**
 * Build gate — spec Phase 0: "deliberately removing one environment variable fails
 * the build rather than the request."
 *
 * Runs as `prebuild`. Loads the same .env files Next.js would, then validates both
 * halves of the environment against the one Zod schema in lib/env.schema.ts.
 */
import { config as loadEnv } from 'dotenv';
import { clientEnvSchema, formatEnvIssues, serverEnvSchema } from '../lib/env.schema';

// Next.js load order: .env, .env.[mode], .env.local, .env.[mode].local (last wins).
// dotenv does not overwrite already-set keys, so load highest priority first.
const mode = process.env.NODE_ENV ?? 'development';
for (const file of [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env']) {
  loadEnv({ path: file, quiet: true });
}

const results = [
  { label: 'server', result: serverEnvSchema.safeParse(process.env) },
  { label: 'public', result: clientEnvSchema.safeParse(process.env) },
];

const failures = results.filter((r) => !r.result.success);

if (failures.length > 0) {
  console.error('\nEnvironment check failed.\n');
  for (const { label, result } of failures) {
    if (!result.success) {
      console.error(`${label} environment:\n${formatEnvIssues(result.error)}\n`);
    }
  }
  console.error('Copy .env.example to .env.local and fill in the missing values.\n');
  process.exit(1);
}

console.log('Environment check passed.');
