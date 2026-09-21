import 'server-only';
import { env } from '@/lib/env';
import { postToSelf } from '@/lib/http/internal';
import { handlers } from './handlers';
import { supabaseJobStore } from './store';

export type KickResult = {
  fired: number;
  accepted: number;
  claimable: number;
  running: number;
  staleQueued: number;
  unhandled: number;
};

/**
 * Starts workers for whatever is claimable (spec §13).
 *
 * Fires one POST to /api/jobs/run per free concurrency slot, up to the number of
 * claimable jobs. Each run invocation claims its OWN job; the kick claims
 * nothing. So a fan-out call that is dropped in transit costs one worker, and
 * the job it would have run stays queued for the next sweep within a minute —
 * rather than sitting `running` with no worker until the reaper frees it.
 *
 * JOB_CONCURRENCY is a ceiling on simultaneously running jobs, not an exact
 * count: two kicks racing can briefly overshoot it. The hard ceiling on the
 * model provider is the Redis semaphore around the model call (Phase 4).
 */
export async function kickWorkers(): Promise<KickResult> {
  const types = Object.keys(handlers);
  const stats = await supabaseJobStore.stats(types);

  const empty = { fired: 0, accepted: 0, ...stats };
  if (types.length === 0) return empty;

  const slots = Math.max(0, env.JOB_CONCURRENCY - stats.running);
  const fire = Math.min(slots, stats.claimable);
  if (fire === 0) return empty;

  const results = await Promise.all(
    Array.from({ length: fire }, () => postToSelf('/api/jobs/run', env.WORKER_SECRET)),
  );

  return { ...empty, fired: fire, accepted: results.filter(Boolean).length };
}
