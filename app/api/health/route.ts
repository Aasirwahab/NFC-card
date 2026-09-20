import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/db/service';

/**
 * GET /api/health — liveness plus a dependency check (spec §15.1).
 *
 * Used by the CI smoke step and by uptime monitoring. It reports on Redis but
 * never fails because of it: Redis fails open by design, so a Redis outage is a
 * degraded system, not a dead one (§24.3).
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, 'ok' | 'degraded' | 'down'> = {};

  try {
    // The cheapest query that proves the connection and the schema both exist.
    const { error } = await serviceClient().from('cards').select('id').limit(1);
    checks.database = error ? 'down' : 'ok';
  } catch {
    checks.database = 'down';
  }

  checks.redis =
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? 'ok' : 'degraded';

  const healthy = checks.database === 'ok';

  return NextResponse.json(
    { status: healthy ? 'ok' : 'unhealthy', checks },
    { status: healthy ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
