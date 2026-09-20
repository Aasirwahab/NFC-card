import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/**
 * The request-scoped Supabase client, used for ONE job: establishing who the
 * signed-in rep is.
 *
 * It carries the anon key, so it grants nothing through RLS beyond the rep's own
 * rows — and in practice nothing at all, because every read and write the
 * application performs goes through the service client below. Rule §9.2: the
 * browser never talks to Supabase directly, and neither does anything holding a
 * key a browser could have.
 *
 * A new client must be created per request: the library delivers cache-control
 * headers with the first cookie write only, and reusing one across requests
 * would leave later responses without them.
 */
export async function createAuthClient() {
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // proxy refreshes the session on every request, so the write that
          // matters has already happened there.
        }
      },
    },
  });
}

export type RepIdentity = {
  userId: string;
  email: string;
};

/**
 * The signed-in rep, or null. Always verified against the auth server rather than
 * decoded from the cookie: a cookie is attacker-supplied input.
 */
export async function getRep(): Promise<RepIdentity | null> {
  const supabase = await createAuthClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return { userId: user.id, email: user.email ?? '' };
}

/**
 * The same, but for routes that cannot proceed without a rep. Throws rather than
 * returning null so a missing check is a crash in development, not a silent
 * query scoped to `undefined`.
 */
export async function requireRep(): Promise<RepIdentity> {
  const rep = await getRep();
  if (!rep) throw new Error('unauthenticated');
  return rep;
}
