import { NextResponse } from 'next/server';
import { alert } from '@/lib/alert';
import { env } from '@/lib/env';
import { serviceClient } from '@/lib/db/service';
import { kickWorkers } from '@/lib/jobs/kick';
import { claimOnce } from '@/lib/security/once';
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
 *   3. SCHEDULE — queue any morning-after event emails and no-tap follow-up
 *      drafts that have come due (both idempotent; see their migrations), and
 *      once a day run the retention purge (§23).
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

  const { data: followups, error: followupError } =
    await serviceClient().rpc('queue_no_tap_followups');
  if (followupError) {
    console.error(
      JSON.stringify({ event: 'queue_no_tap_followups_failed', error: followupError.message }),
    );
  }

  // Once a day. claimOnce fails open, so a Redis outage means the purge runs on
  // every sweep that day: harmless, it only deletes what is past retention.
  let purged: number | null = null;
  if (await claimOnce(`retention-purge:${new Date().toISOString().slice(0, 10)}`, 26 * 3600)) {
    const { data, error } = await serviceClient().rpc('purge_expired_sessions', {
      p_months: env.RETENTION_MONTHS,
    });
    if (error) {
      console.error(JSON.stringify({ event: 'retention_purge_failed', error: error.message }));
    } else {
      purged = data ?? 0;
      if (purged > 0) console.log(JSON.stringify({ event: 'retention_purge', purged }));
    }
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
    followupsQueued: followups ?? 0,
    purged,
    dead: reaped.filter((j) => j.outcome === 'dead').length,
    ...kick,
  });
}
