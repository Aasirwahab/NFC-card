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
export const serverEnvSchema = z
  .object({
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

    // Model access (§14.3), through the Vercel AI Gateway: one key, and model ids
    // as config, so switching provider is a deploy rather than a rewrite. The
    // provider itself is still an open decision (§28). `mock` runs the whole
    // pipeline offline (§25.1) and is never used for real prospects in production
    // (lib/jobs/handlers.ts).
    MODEL_API_KEY: blankAsUnset(z.string().optional()),
    /** The pitch — the product's only differentiator. The best model (§14.3). */
    MODEL_PITCH: blankAsUnset(z.string().default('mock')),
    /** The chatbot — high volume, low stakes. A cheap model (§14.3). */
    MODEL_CHAT: blankAsUnset(z.string().default('mock')),
    /**
     * Company research (step 3). Defaults to MODEL_CHAT: §28 suggests "a cheaper
     * research pass — but not a cheaper pitch model" as a margin lever.
     */
    MODEL_RESEARCH: blankAsUnset(z.string().optional()),

    // Set by Vercel on every deployment. Absent locally.
    VERCEL_ENV: blankAsUnset(z.enum(['production', 'preview', 'development']).optional()),

    // Phase 5 — email and booking.
    RESEND_API_KEY: blankAsUnset(z.string().optional()),
    /** The sender, e.g. "TapLead <alerts@taplead.app>". Required with a Resend key. */
    EMAIL_FROM: blankAsUnset(z.string().optional()),
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
  })
  .superRefine((vars, ctx) => {
    // A real model id with no key would boot fine and fail on the first job, hours
    // later, at an event. Fail the build instead.
    const ids = [vars.MODEL_PITCH, vars.MODEL_CHAT, vars.MODEL_RESEARCH].filter(Boolean);
    if (ids.some((id) => id !== 'mock') && !vars.MODEL_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['MODEL_API_KEY'],
        message:
          'required when any of MODEL_PITCH, MODEL_CHAT or MODEL_RESEARCH is a real model id',
      });
    }

    // Same reasoning: a key with no sender boots fine and fails on the first alert.
    if (vars.RESEND_API_KEY && !vars.EMAIL_FROM) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message: 'required when RESEND_API_KEY is set, e.g. "TapLead <alerts@taplead.app>"',
      });
    }
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
