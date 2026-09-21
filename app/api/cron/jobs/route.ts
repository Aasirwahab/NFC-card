import { NextResponse } from 'next/server';
import { alert } from '@/lib/alert';
import { env } from '@/lib/env';
import { kickWorkers } from '@/lib/jobs/kick';
import { supabaseJobStore } from '@/lib/jobs/store';
import { bearerMatches } from '@/lib/security/bearer';

/**
 * GET /api/cron/jobs — every minute, from Vercel Cron (spec §13, §15.3).
 *
 * The safety net under the after() kick: a missed kick costs at most sixty
 * seconds. Three jobs, in order:
 *
 *   1. REAP — a job `running` with a lock older than ten minutes belongs to a
 *      worker that died. Back to queued, or dead when its attempts are spent.
 *   2. SWEEP — kick workers for anything claimable.
 *   3. WATCH — more than three jobs queued for over fifteen minutes means the
 *      kick and the sweep are both failing (§24.2). Alert.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that variable is
 * set, so the check below is all the configuration it needs.
 */

/** Longer than any worker can legitimately hold a job: maxDuration is 300s. */
const STALE_AFTER_SECONDS = 10 * 60;

export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get('authorization'), env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const reaped = await supabaseJobStore.reap(STALE_AFTER_SECONDS);

  for (const job of reaped.filter((j) => j.outcome === 'dead')) {
    alert('job_dead', { jobId: job.jobId, type: job.jobType, reason: 'reaped' });
  }

  const kick = await kickWorkers();

  if (kick.staleQueued > 3) {
    alert('queue_stalled', {
      staleQueued: kick.staleQueued,
      claimable: kick.claimable,
      running: kick.running,
    });
  }

  return NextResponse.json({
    reaped: reaped.length,
    dead: reaped.filter((j) => j.outcome === 'dead').length,
    ...kick,
  });
}
