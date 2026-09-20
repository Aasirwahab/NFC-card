import { describe, expect, it } from 'vitest';
import { serverEnvSchema } from '@/lib/env.schema';

/** The smallest environment that should boot. */
const valid = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  NEXT_PUBLIC_APP_URL: 'https://taplead.app',
  WORKER_SECRET: 'a'.repeat(32),
  CRON_SECRET: 'b'.repeat(32),
};

describe('server environment (§22.3)', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const parsed = serverEnvSchema.parse(valid);
    expect(parsed.JOB_CONCURRENCY).toBe(4);
    expect(parsed.JOB_BATCH).toBe(10);
    expect(parsed.CHAT_ENABLED).toBe(true);
    expect(parsed.MODEL_PITCH).toBe('mock');
  });

  it('rejects a missing required secret (Phase 0 done-when)', () => {
    for (const key of Object.keys(valid) as (keyof typeof valid)[]) {
      const without: Partial<typeof valid> = { ...valid };
      delete without[key];
      const result = serverEnvSchema.safeParse(without);
      expect(result.success, `removing ${key} should fail`).toBe(false);
    }
  });

  it('rejects a short worker or cron secret', () => {
    expect(serverEnvSchema.safeParse({ ...valid, WORKER_SECRET: 'short' }).success).toBe(false);
    expect(serverEnvSchema.safeParse({ ...valid, CRON_SECRET: 'short' }).success).toBe(false);
  });

  it('rejects a malformed URL rather than booting half-configured', () => {
    expect(serverEnvSchema.safeParse({ ...valid, SUPABASE_URL: 'not-a-url' }).success).toBe(false);
  });

  it('treats a blank optional value as unset, not as invalid', () => {
    // .env files carry unset variables as empty strings.
    const parsed = serverEnvSchema.parse({
      ...valid,
      UPSTASH_REDIS_REST_URL: '',
      MODEL_API_KEY: '',
      RESEND_API_KEY: '',
    });
    expect(parsed.UPSTASH_REDIS_REST_URL).toBeUndefined();
    expect(parsed.MODEL_API_KEY).toBeUndefined();
  });

  it('turns the chat kill switch into a boolean', () => {
    expect(serverEnvSchema.parse({ ...valid, CHAT_ENABLED: 'false' }).CHAT_ENABLED).toBe(false);
    expect(serverEnvSchema.safeParse({ ...valid, CHAT_ENABLED: 'yes' }).success).toBe(false);
  });
});
