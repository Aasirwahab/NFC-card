import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { kickWorkers } from '@/lib/jobs/kick';
import { bearerMatches } from '@/lib/security/bearer';

/**
 * POST /api/jobs/kick — start workers for whatever is claimable (spec §15.3).
 *
 * The app normally kicks in-process (after() in the session PATCH, and the cron
 * sweep). This route exists for an operator, or anything else holding
 * WORKER_SECRET, to nudge the queue by hand.
 */
export async function POST(request: Request) {
  if (!bearerMatches(request.headers.get('authorization'), env.WORKER_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return NextResponse.json(await kickWorkers());
}
