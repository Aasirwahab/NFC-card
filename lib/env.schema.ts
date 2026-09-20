import { z } from 'zod';

/**
 * Spec §22.3 / §25.3 — every environment variable is parsed through one Zod schema.
 * A missing or malformed secret crashes the process immediately, and fails the build
 * before that (scripts/check-env.ts). A system that boots half-configured and fails
 * quietly at 9pm during an event is the worse outcome.
 *
 * This file is pure: no side effects, no `server-only`, so the build-time checker and
 * the tests can import it. Parsing happens in env.ts and env.client.ts.
 *
 * The schema is the documentation. The table in §25.3 will drift; this will not.
 */

const required = z.string().min(1);

/**
 * .env files carry unset variables as empty strings, not as absent keys. Without
 * this, `UPSTASH_REDIS_REST_URL=` in a freshly copied .env.example fails the build
 * with "Invalid URL" — which is a confusing way to say "you left it blank".
 */
function blankAsUnset<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema);
}

/** Variables that must never reach the browser bundle. Guarded by CI gate 2. */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database — the service role bypasses every RLS policy. Never NEXT_PUBLIC_.
  SUPABASE_URL: required.url(),
  SUPABASE_SERVICE_ROLE_KEY: required,

  // Also read on the server: rep auth runs server-side (see lib/db/server.ts),
  // and the tag URL is built for the CSV export that feeds the NFC writer.
  NEXT_PUBLIC_SUPABASE_URL: required.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required,
  NEXT_PUBLIC_APP_URL: required.url(),

  // Bearer secrets on the worker and cron routes (§15.3).
  WORKER_SECRET: required.min(24, 'use at least 24 characters'),
  CRON_SECRET: required.min(24, 'use at least 24 characters'),

  // Rate limits, concurrency semaphore, research cache (§25.3).
  // Optional: Redis fails open by design (§24.3), so the app still boots without it.
  UPSTASH_REDIS_REST_URL: blankAsUnset(z.string().url().optional()),
  UPSTASH_REDIS_REST_TOKEN: blankAsUnset(z.string().optional()),

  // Phase 4 — model access (§14.3). Provider is still an open decision (§28).
  MODEL_API_KEY: blankAsUnset(z.string().optional()),
  MODEL_PITCH: blankAsUnset(z.string().default('mock')),
  MODEL_CHAT: blankAsUnset(z.string().default('mock')),

  // Phase 5 — email and booking.
  RESEND_API_KEY: blankAsUnset(z.string().optional()),
  CAL_WEBHOOK_SECRET: blankAsUnset(z.string().optional()),

  // Queue tuning, changeable without a code change (§25.3).
  JOB_CONCURRENCY: blankAsUnset(z.coerce.number().int().min(1).max(50).default(4)),
  JOB_BATCH: blankAsUnset(z.coerce.number().int().min(1).max(100).default(10)),

  // Chatbot kill switch (§18.2).
  CHAT_ENABLED: blankAsUnset(
    z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  ),

  // Error tracking. Absent = no-op, which is what local and CI want.
  SENTRY_DSN: blankAsUnset(z.string().optional()),
});

/**
 * Client-visible configuration. Every value here is compiled into the browser bundle,
 * so nothing secret may live in it.
 */
export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  /** Origin written onto the NFC tags. Used to build card URLs for tag writing. */
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

/** Shared formatter so the build-time checker and the runtime report identically. */
export function formatEnvIssues(error: z.ZodError): string {
  return error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}
