import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import { serviceClient } from '@/lib/db/service';
import { checkRateLimit, clientIp, peekRateLimit } from '@/lib/security/rate-limit';

/**
 * GET /api/landing/[code]/status — polled by the "crafting" state (spec §15.1).
 *
 * RETURNS `{status}` AND NOTHING ELSE. No name, no company, no pitch, no note.
 *
 * This route is the reason the landing page does not use Supabase Realtime. That
 * design had the prospect's browser subscribe to the sessions row, which needs an
 * anon-key connection and an RLS policy on the one table holding prospect names,
 * employers and personal notes — punching a hole in §9.2 for a state the prospect
 * almost never sees. A three-second poll of this route returns one string (§16).
 *
 * Keep it that way. Every field added here is a field served to anyone who can
 * guess a code.
 */
export const dynamic = 'force-dynamic';

/** Statuses are never leaked as-is; they are mapped to what the client needs. */
type PublicStatus = 'pending' | 'working' | 'completed' | 'failed';

function publicStatus(enrichmentStatus: string): PublicStatus {
  switch (enrichmentStatus) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'queued':
    case 'processing':
      return 'working';
    default:
      return 'pending';
  }
}

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code: raw } = await context.params;
  const code = normaliseCode(raw);

  const ip = clientIp(await headers());
  // Shares the page's miss budget (§22.2). Polled at 60 a minute, this route is a
  // faster way to walk the code space than the page itself, so its misses count
  // against the same limiter, and an IP that has spent it is refused for every code.
  const [limit, missesLeft] = await Promise.all([
    checkRateLimit('landingStatus', ip),
    peekRateLimit('landingMiss', ip),
  ]);

  if (!limit.allowed || !missesLeft) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(limit.allowed ? 60 : limit.retryAfter) } },
    );
  }

  // Same generic miss as the page itself: nothing here distinguishes an unknown
  // code from a known card with no live session (§22.2).
  const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });
  const miss = async () => {
    await checkRateLimit('landingMiss', ip);
    return notFound();
  };

  if (!isValidCode(code)) return miss();

  const db = serviceClient();

  const { data: card } = await db.from('cards').select('id').eq('code', code).maybeSingle();
  if (!card) return miss();

  const { data: session } = await db
    .from('sessions')
    .select('enrichment_status')
    .eq('card_id', card.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!session) return miss();

  return NextResponse.json(
    { status: publicStatus(session.enrichment_status) },
    { headers: { 'cache-control': 'no-store' } },
  );
}
