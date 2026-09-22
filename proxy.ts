import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { REP_DEVICE_COOKIE } from '@/lib/domain/audience';

/**
 * Proxy (what Next.js called middleware before 16).
 *
 * Two jobs, both cheap:
 *
 *   1. Refresh the rep's Supabase session and write the rotated cookies onto the
 *      response. Without this, Server Components read a stale token and reps get
 *      logged out at random — during an event, which is the worst possible time.
 *   2. An optimistic redirect for the authenticated app. This is a convenience,
 *      not the authorisation boundary: every rep route verifies the session
 *      server-side and scopes its queries by user_id (§22.6).
 *
 * `/c/[code]` is deliberately NOT protected. It is the dual-audience route (§8) —
 * the same URL serves the signed-in rep and an anonymous prospect — so it runs
 * the refresh and decides for itself who is asking.
 *
 * Environment variables are read directly here rather than through lib/env.ts:
 * the proxy bundle does not resolve the `react-server` export condition that
 * `server-only` relies on. scripts/check-env.ts has already failed the build if
 * either of these is missing.
 */

const SIGN_IN = '/sign-in';

/** Routes that require a signed-in rep. */
const PROTECTED_PREFIXES = ['/dashboard', '/events', '/sessions', '/cards', '/settings'];

/** Routes a signed-in rep should not linger on. */
const AUTH_PREFIXES = ['/sign-in', '/sign-up'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // A response that sets auth cookies must not be cached by a CDN,
          // or one rep's token is served to someone else.
          for (const [key, value] of Object.entries(headers ?? {})) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Verified against the auth server, not decoded from the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone();
    url.pathname = SIGN_IN;
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (user && AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Mark this browser as the rep's, so a later tap on their own card does not
  // count as a prospect view even once the session has expired (§10.4).
  if (user && request.cookies.get(REP_DEVICE_COOKIE)?.value !== user.id) {
    response.cookies.set(REP_DEVICE_COOKIE, user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 400 * 24 * 60 * 60, // the longest browsers allow
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image optimisation. `/c/:code` IS
     * included: it needs the refreshed session to tell a rep from a prospect.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
