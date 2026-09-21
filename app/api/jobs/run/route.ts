import { after, NextResponse } from 'next/server';
import { alert } from '@/lib/alert';
import { env } from '@/lib/env';
import { createBudget } from '@/lib/jobs/budget';
import { handlers } from '@/lib/jobs/handlers';
import { kickWorkers } from '@/lib/jobs/kick';
import { drain } from '@/lib/jobs/runner';
import { supabaseJobStore } from '@/lib/jobs/store';
import { bearerMatches } from '@/lib/security/bearer';

/**
 * POST /api/jobs/run — one worker (spec §13, §15.3). Caller: the kick.
 *
 * Answers 202 at once and does the work in after(), so the kick's fan-out call
 * only has to wait for acceptance, never for a job. The work then runs for up to
 * maxDuration, draining jobs until the queue is empty or the budget is spent.
 */

// Set explicitly (§13: "set maxDuration explicitly on /api/jobs/run"). The
// budget below is derived from it, so the two can never disagree.
export const maxDuration = 300;

/**
 * Kept back from maxDuration for the final writes after the last step: marking
 * the job done, or yielding it. A step that would cut into this is not started.
 */
const RESERVE_MS = 30_000;

export async function POST(request: Request) {
  if (!bearerMatches(request.headers.get('authorization'), env.WORKER_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Measured from arrival, not from when after() starts, so the budget can
  // never outlive the invocation.
  const budget = createBudget(maxDuration * 1000 - RESERVE_MS);
  const worker = `run-${crypto.randomUUID()}`;

  after(async () => {
    const outcomes = await drain(
      {
        store: supabaseJobStore,
        handlers,
        worker,
        budget,
        random: Math.random,
        alert,
      },
      env.JOB_BATCH,
    );

    console.log(
      JSON.stringify({
        event: 'worker_finished',
        worker,
        outcomes: outcomes.map((o) => o.kind),
        remainingMs: budget.remainingMs(),
      }),
    );

    // A yield or a restart means a job is back in the queue. Kick at once rather
    // than leaving it for the minute-by-minute sweep; a job deferred with a delay
    // is not due yet, so the kick simply finds nothing to start.
    if (outcomes.some((o) => o.kind === 'yielded' || o.kind === 'restarted')) {
      await kickWorkers();
    }
  });

  return NextResponse.json({ accepted: true, worker }, { status: 202 });
}
