import 'server-only';
import { NextResponse } from 'next/server';
import { getRep, type RepIdentity } from '@/lib/db/server';

/**
 * Shared route-handler plumbing.
 *
 * Every rep route verifies the session server-side and scopes every query by
 * user_id. RLS is the backstop, not the only check (§22.6) — and since these
 * routes hold the service role, RLS is not a check on this path at all.
 */

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

/**
 * An error the client can branch on. The `error` field is a stable machine code,
 * never a sentence — the contract in §15.4 depends on it.
 */
export function fail(code: string, status: number, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: code, ...extra }, { status });
}

/**
 * Wraps a handler so it only runs for a signed-in rep.
 *
 * The return type is `Response`, not `NextResponse`: the CSV export streams a
 * plain Response, and narrowing this would force it to fake one.
 */
export function withRep<Args extends unknown[]>(
  handler: (rep: RepIdentity, request: Request, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    const rep = await getRep();
    if (!rep) return fail('unauthenticated', 401);

    try {
      return await handler(rep, request, ...args);
    } catch (error) {
      // Never leak an internal message to a client. The log keeps the detail.
      console.error(
        JSON.stringify({
          event: 'route_error',
          path: new URL(request.url).pathname,
          userId: rep.userId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return fail('internal_error', 500);
    }
  };
}

/** Parses a JSON body, returning null rather than throwing on malformed input. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Constant-time bearer check for the worker and cron routes (§15.3).
 *
 * A plain `===` on a secret leaks its length and, in principle, its prefix
 * through timing. The comparison below always walks the whole of both strings.
 */
export function bearerMatches(request: Request, secret: string): boolean {
  const header = request.headers.get('authorization') ?? '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;

  const provided = header.slice(prefix.length);
  if (provided.length !== secret.length) return false;

  let difference = 0;
  for (let i = 0; i < secret.length; i++) {
    difference |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return difference === 0;
}
