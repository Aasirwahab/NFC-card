import { NextResponse } from 'next/server';
import { alert } from '@/lib/alert';
import { env } from '@/lib/env';
import { serviceClient } from '@/lib/db/service';
import { kickWorkers } from '@/lib/jobs/kick';
import { supabaseJobStore } from '@/lib/jobs/store';
import { bearerMatches } from '@/lib/security/bearer';

/**
 * GET /api/cron/jobs — every minute, from Vercel Cron (spec §13, §15.3).
 *
 * The safety net under the after() kick: a missed kick costs at most sixty
 * seconds. Four jobs, in order:
 *
 *   1. REAP — a job `running` with a lock older than ten minutes belongs to a
 *      worker that died. Back to queued, or dead when its attempts are spent.
 *   2. SWEEP — kick workers for anything claimable.
 *   3. SCHEDULE — queue any morning-after event emails that have come due
 *      (queue_event_digests is idempotent; see its migration).
 *   4. WATCH — more than three jobs queued for over fifteen minutes means the
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

  // Before the sweep, so a digest queued now is picked up by this same kick.
  const { data: digests, error: digestError } = await serviceClient().rpc('queue_event_digests');
  if (digestError) {
    console.error(
      JSON.stringify({ event: 'queue_event_digests_failed', error: digestError.message }),
    );
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
    digestsQueued: digests ?? 0,
    dead: reaped.filter((j) => j.outcome === 'dead').length,
    ...kick,
  });
}
