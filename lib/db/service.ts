import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import type { Database } from './types';

/**
 * The service-role client. This is how the application reads and writes
 * everything (§9.2).
 *
 * It bypasses every RLS policy, so two rules apply without exception:
 *
 *   1. It never leaves the server. `import 'server-only'` makes a client-side
 *      import a build error, and CI gate 2 scans the bundle as a backstop.
 *   2. Every query it makes is scoped by `user_id` in the query itself. RLS is
 *      the backstop, not the only check (§22.6) — and with this key RLS is not
 *      a check at all.
 *
 * Auth is disabled on purpose: this client has no session, refreshes nothing,
 * and must never pick up a cookie.
 */
let cached: SupabaseClient<Database> | null = null;

export function serviceClient(): SupabaseClient<Database> {
  cached ??= createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return cached;
}
