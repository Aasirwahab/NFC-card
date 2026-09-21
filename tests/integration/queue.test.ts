import { beforeEach, describe, expect, it } from 'vitest';
import { createBudget } from '@/lib/jobs/budget';
import { drain, runNext, type RunnerDeps } from '@/lib/jobs/runner';
import { PermanentJobError, type Handlers, type JobStore } from '@/lib/jobs/types';
import { createTestDb, seedFixture, type TestDb } from './harness';
import { pgliteJobStore } from './job-store';

/**
 * Phase 3 done-when (spec §26):
 *
 *   - killing a worker mid-job results in the reaper re-queueing it
 *   - 20 jobs enqueued at once run EXACTLY ONCE each
 *   - a job that exhausts its attempts lands in `dead` with an alert
 *
 * Plus the properties those depend on: checkpoint-and-resume, the time budget,
 * the lock guard against zombie workers, and the job/session state sync.
 *
 * One honest limit: the in-process Postgres is single-connection, so concurrent
 * workers here interleave rather than truly contend. That proves the claim
 * bookkeeping — no job handed out twice, none lost — but not SKIP LOCKED under
 * real parallel load, which needs the real database.
 */

let db: TestDb;
let store: JobStore;
let userId: string;

beforeEach(async () => {
  db = await createTestDb();
  store = pgliteJobStore(db);
  userId = (await seedFixture(db, { cards: 1 })).userId;
});

async function enqueue(count: number, type = 'test'): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.jobs(type, user_id) values ($1, $2) returning id`,
      [type, userId],
    );
    ids.push(rows[0]!.id);
  }
  return ids;
}

async function jobRow(id: string) {
  const { rows } = await db.query<{
    status: string;
    attempts: number;
    steps: Record<string, unknown>;
    last_error: string | null;
    locked_by: string | null;
  }>(`select status, attempts, steps, last_error, locked_by from public.jobs where id = $1`, [id]);
  return rows[0]!;
}

/** Makes a retrying job due now, standing in for the backoff delay elapsing. */
async function makeDue(id: string) {
  await db.query(`update public.jobs set run_after = now() where id = $1`, [id]);
}

function deps(overrides: Partial<RunnerDeps> & { handlers: Handlers }): RunnerDeps & {
  alerts: { event: string; details: Record<string, unknown> }[];
} {
  const alerts: { event: string; details: Record<string, unknown> }[] = [];
  return {
    store,
    worker: `worker-${crypto.randomUUID()}`,
    budget: createBudget(10 * 60_000),
    random: () => 0.5, // no jitter
    alert: (event, details) => alerts.push({ event, details }),
    alerts,
    ...overrides,
  };
}

describe('exactly-once execution', () => {
  it('runs 20 jobs enqueued at once exactly once each, across 4 workers', async () => {
    const ids = await enqueue(20);
    const executed: string[] = [];

    const handlers: Handlers = {
      test: async ({ job, step }) => {
        await step('work', 1_000, async () => {
          executed.push(job.id);
          return { ok: true };
        });
      },
    };

    // Four workers draining concurrently.
    const results = await Promise.all(
      Array.from({ length: 4 }, () => drain(deps({ handlers }), 100)),
    );

    expect(executed).toHaveLength(20);
    expect(new Set(executed).size).toBe(20);
    expect([...executed].sort()).toEqual([...ids].sort());
    expect(results.flat().every((o) => o.kind === 'succeeded')).toBe(true);

    const { rows } = await db.query<{ status: string; n: number }>(
      `select status, count(*)::int as n from public.jobs group by status`,
    );
    expect(rows).toEqual([{ status: 'succeeded', n: 20 }]);
  });

  it('never claims a job type it has no handler for', async () => {
    const [enrich] = await enqueue(1, 'enrich');
    await enqueue(1, 'test');

    const outcomes = await drain(deps({ handlers: { test: async () => {} } }), 10);

    expect(outcomes.map((o) => o.kind)).toEqual(['succeeded']);
    // Untouched: not claimed, no attempt burned, nothing dead-lettered.
    expect(await jobRow(enrich!)).toMatchObject({ status: 'queued', attempts: 0 });
  });

  it('is idle, not an error, with no handlers at all', async () => {
    await enqueue(3);
    expect(await runNext(deps({ handlers: {} }))).toEqual({ kind: 'idle' });
  });
});

describe('checkpointing and the time budget (§13, §14.1)', () => {
  it('yields before a step that will not fit, without burning the attempt', async () => {
    const [id] = await enqueue(1);
    let clock = 0;
    const calls = { a: 0, b: 0, c: 0 };

    const handlers: Handlers = {
      test: async ({ step }) => {
        await step('a', 10_000, async () => {
          calls.a++;
          clock += 10_000;
          return 'a-done';
        });
        await step('b', 10_000, async () => {
          calls.b++;
          clock += 10_000;
          return 'b-done';
        });
        await step('c', 10_000, async () => {
          calls.c++;
          clock += 10_000;
          return 'c-done';
        });
      },
    };

    // 15 seconds: step a fits, then only 5 seconds remain for step b.
    const first = await runNext(deps({ handlers, budget: createBudget(15_000, () => clock) }));

    expect(first.kind).toBe('yielded');
    expect(calls).toEqual({ a: 1, b: 0, c: 0 });
    expect(await jobRow(id!)).toMatchObject({
      status: 'queued',
      attempts: 0, // running out of time is not a failure
      steps: { a: 'a-done' },
      locked_by: null,
    });

    // The next invocation RESUMES: step a is read from the checkpoint, not re-run.
    const second = await runNext(deps({ handlers, budget: createBudget(60_000, () => clock) }));

    expect(second.kind).toBe('succeeded');
    expect(calls).toEqual({ a: 1, b: 1, c: 1 });
    expect(await jobRow(id!)).toMatchObject({
      status: 'succeeded',
      steps: { a: 'a-done', b: 'b-done', c: 'c-done' },
    });
  });

  it('resumes after a FAILURE from the last checkpoint, not from the start', async () => {
    // §26 Phase 4 names the case: "a forced step-5 failure resumes from
    // checkpoint without re-running research". The mechanism is here.
    const [id] = await enqueue(1);
    const calls = { research: 0, pitch: 0 };
    let failPitch = true;

    const handlers: Handlers = {
      test: async ({ step }) => {
        await step('research', 1_000, async () => {
          calls.research++;
          return { signals: ['a'] };
        });
        await step('pitch', 1_000, async () => {
          calls.pitch++;
          if (failPitch) throw new Error('model provider timed out');
          return 'the pitch';
        });
      },
    };

    const first = await runNext(deps({ handlers }));
    expect(first).toMatchObject({ kind: 'retrying', retryInSeconds: 60 });

    failPitch = false;
    await makeDue(id!);
    const second = await runNext(deps({ handlers }));

    expect(second.kind).toBe('succeeded');
    expect(calls).toEqual({ research: 1, pitch: 2 });
  });

  it('drain stops claiming when too little budget is left to start a job', async () => {
    await enqueue(2);
    const outcomes = await drain(
      deps({ handlers: { test: async () => {} }, budget: createBudget(10_000, () => 0) }),
      10,
    );
    expect(outcomes).toEqual([]);
  });
});

describe('the reaper (§13)', () => {
  it('re-queues a job whose worker was killed mid-job', async () => {
    const [id] = await enqueue(1);

    // A worker claims the job and dies without another word.
    const claimed = await store.claim('killed-worker', ['test']);
    expect(claimed?.id).toBe(id);

    // A fresh lock is left alone: that worker may still be alive.
    expect(await store.reap(600)).toEqual([]);

    // Ten minutes later the lock is stale.
    await db.query(
      `update public.jobs set locked_at = now() - interval '11 minutes' where id = $1`,
      [id],
    );
    expect(await store.reap(600)).toEqual([{ jobId: id, jobType: 'test', outcome: 'queued' }]);

    const outcome = await runNext(deps({ handlers: { test: async () => {} } }));
    expect(outcome).toMatchObject({ kind: 'succeeded', jobId: id });
    // The dead worker's attempt was NOT given back: a job that reliably kills its
    // worker must eventually stop being retried.
    expect(await jobRow(id!)).toMatchObject({ status: 'succeeded', attempts: 2 });
  });

  it('dead-letters a reaped job whose attempts are spent', async () => {
    const [id] = await enqueue(1);
    await db.query(`update public.jobs set attempts = 2 where id = $1`, [id]);
    await store.claim('killed-worker', ['test']); // attempt 3 of 3
    await db.query(
      `update public.jobs set locked_at = now() - interval '11 minutes' where id = $1`,
      [id],
    );

    expect(await store.reap(600)).toEqual([{ jobId: id, jobType: 'test', outcome: 'dead' }]);
    expect((await jobRow(id!)).last_error).toMatch(/reaped/);
  });

  it('stops a zombie worker from writing after its job was handed on', async () => {
    const [id] = await enqueue(1);
    await store.claim('zombie', ['test']);
    await db.query(
      `update public.jobs set locked_at = now() - interval '11 minutes' where id = $1`,
      [id],
    );
    await store.reap(600);
    await store.claim('successor', ['test']);

    // The zombie wakes up and tries to carry on. Every write matches zero rows.
    expect(await store.saveStep(id!, 'zombie', 'x', { stale: true })).toBe(false);
    expect(await store.complete(id!, 'zombie')).toBe(false);
    expect(await store.yield(id!, 'zombie')).toBe(false);
    expect(await store.fail(id!, 'zombie', 'boom', 60)).toBeNull();

    expect(await jobRow(id!)).toMatchObject({
      status: 'running',
      locked_by: 'successor',
      steps: {},
    });
  });

  it('reports lost_lock when reaped DURING a step, and discards that step', async () => {
    const [id] = await enqueue(1);

    const handlers: Handlers = {
      test: async ({ step }) => {
        await step('slow', 1_000, async () => {
          // While this step runs, the reaper hands the job to someone else.
          await db.query(
            `update public.jobs set locked_by = 'successor', locked_at = now() where id = $1`,
            [id],
          );
          return 'result from a worker that no longer holds the job';
        });
      },
    };

    const outcome = await runNext(deps({ handlers }));
    expect(outcome.kind).toBe('lost_lock');
    expect((await jobRow(id!)).steps).toEqual({});
  });
});

describe('dead-lettering (§13, §24.2)', () => {
  it('lands a job that exhausts its attempts in dead, with an alert', async () => {
    const [id] = await enqueue(1);
    const handlers: Handlers = {
      test: async () => {
        throw new Error('provider unavailable');
      },
    };

    const d = deps({ handlers });

    const first = await runNext(d);
    expect(first).toMatchObject({ kind: 'retrying', retryInSeconds: 60 });

    await makeDue(id!);
    const second = await runNext(d);
    expect(second).toMatchObject({ kind: 'retrying', retryInSeconds: 300 });

    await makeDue(id!);
    const third = await runNext(d);
    expect(third).toMatchObject({ kind: 'dead', attempts: 3 });

    expect(await jobRow(id!)).toMatchObject({ status: 'dead', attempts: 3 });
    expect((await jobRow(id!)).last_error).toMatch(/provider unavailable/);
    expect(d.alerts).toEqual([
      expect.objectContaining({
        event: 'job_dead',
        details: expect.objectContaining({ jobId: id }),
      }),
    ]);
  });

  it('does not retry before the backoff has elapsed', async () => {
    await enqueue(1);
    const handlers: Handlers = {
      test: async () => {
        throw new Error('transient');
      },
    };

    expect((await runNext(deps({ handlers }))).kind).toBe('retrying');
    // run_after is 60 seconds out, so there is nothing due.
    expect(await runNext(deps({ handlers }))).toEqual({ kind: 'idle' });
  });

  it('dead-letters a permanent failure at once, without spending attempts', async () => {
    const [id] = await enqueue(1);
    const d = deps({
      handlers: {
        test: async () => {
          throw new PermanentJobError('session was voided');
        },
      },
    });

    expect(await runNext(d)).toMatchObject({ kind: 'dead', attempts: 1 });
    expect(await jobRow(id!)).toMatchObject({ status: 'dead', attempts: 1 });
    expect(d.alerts).toHaveLength(1);
  });
});

describe('keeping the session in step (§10.2, §16)', () => {
  async function sessionWithEnrichJob() {
    const fx = await seedFixture(db, { cards: 1 });
    const sessionId = crypto.randomUUID();
    await db.query(`select * from public.register_card($1, $2, $3, $4, $5, $6)`, [
      sessionId,
      fx.codes[0]!,
      fx.eventId,
      fx.userId,
      'Zaid',
      null,
    ]);
    await db.query(`select * from public.save_session_details($1, $2, $3::jsonb)`, [
      sessionId,
      fx.userId,
      JSON.stringify({ prospect_name: 'Tom', problems: ['Idle machine tracking'] }),
    ]);
    const { rows } = await db.query<{ id: string }>(
      `select id from public.jobs where session_id = $1`,
      [sessionId],
    );
    return { sessionId, jobId: rows[0]!.id };
  }

  async function session(id: string) {
    const { rows } = await db.query<{
      enrichment_status: string;
      enrichment_attempts: number;
      enrichment_started_at: string | null;
      enrichment_last_error: string | null;
    }>(
      `select enrichment_status, enrichment_attempts, enrichment_started_at, enrichment_last_error
         from public.sessions where id = $1`,
      [id],
    );
    return rows[0]!;
  }

  it('moves the session to processing when its job starts', async () => {
    const { sessionId } = await sessionWithEnrichJob();
    let seenDuringRun: string | null = null;

    await runNext(
      deps({
        handlers: {
          enrich: async () => {
            seenDuringRun = (await session(sessionId)).enrichment_status;
          },
        },
      }),
    );

    expect(seenDuringRun).toBe('processing');
    expect((await session(sessionId)).enrichment_attempts).toBe(1);
  });

  it('fails the session when its job dies, so the page never spins forever', async () => {
    // Without this, a dead job leaves the prospect on the crafting state for
    // good. With it they get the template pitch and cannot tell (§16).
    const { sessionId, jobId } = await sessionWithEnrichJob();
    const d = deps({
      handlers: {
        enrich: async () => {
          throw new Error('model provider down');
        },
      },
    });

    for (let i = 0; i < 3; i++) {
      await makeDue(jobId);
      await runNext(d);
    }

    expect(await session(sessionId)).toMatchObject({
      enrichment_status: 'failed',
      enrichment_attempts: 3,
    });
    expect((await session(sessionId)).enrichment_last_error).toMatch(/model provider down/);

    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.session_events
        where session_id = $1 and type = 'enrichment_failed'`,
      [sessionId],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('leaves a voided session voided when void_session kills its job', async () => {
    const { sessionId } = await sessionWithEnrichJob();
    const { rows: owner } = await db.query<{ user_id: string }>(
      `select user_id from public.sessions where id = $1`,
      [sessionId],
    );
    await db.query(`select * from public.void_session($1, $2)`, [sessionId, owner[0]!.user_id]);

    const { rows } = await db.query<{ status: string; enrichment_status: string; failed: number }>(
      `select s.status, s.enrichment_status,
              (select count(*)::int from public.session_events e
                where e.session_id = s.id and e.type = 'enrichment_failed') as failed
         from public.sessions s where s.id = $1`,
      [sessionId],
    );
    expect(rows[0]).toEqual({ status: 'voided', enrichment_status: 'queued', failed: 0 });
  });
});

describe('queue_stats', () => {
  it('counts only handled types as claimable or stale, and the rest as unhandled', async () => {
    const testJobs = await enqueue(3, 'test');
    const enrichJobs = await enqueue(3, 'enrich');
    const claimed = await store.claim('w', ['test']);

    // Age one of the two still-queued test jobs, and every enrich job.
    const stale = testJobs.find((id) => id !== claimed!.id)!;
    await db.query(
      `update public.jobs set run_after = now() - interval '20 minutes'
        where id = any($1::uuid[])`,
      [[stale, ...enrichJobs]],
    );

    expect(await store.stats(['test'])).toEqual({
      running: 1,
      claimable: 2,
      staleQueued: 1,
      // Waiting for a handler by design: counted, but never as stale, so they
      // cannot trip the "queue stalled" alert however long they wait.
      unhandled: 3,
    });
  });
});
