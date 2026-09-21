import type { Job, JobStore, QueueStats, ReapedJob } from '@/lib/jobs/types';
import type { TestDb } from './harness';

/**
 * A JobStore over the in-process Postgres, calling exactly the same SQL
 * functions as the production store (lib/jobs/store.ts). The runner under test
 * is the production runner; only the transport differs.
 */
export function pgliteJobStore(db: TestDb): JobStore {
  return {
    async claim(worker, types) {
      const { rows } = await db.query<Job>(`select * from public.claim_jobs($1, 1, $2::text[])`, [
        worker,
        types,
      ]);
      return rows[0] ?? null;
    },

    async saveStep(jobId, worker, step, output) {
      const { rows } = await db.query<{ ok: boolean }>(
        `select public.save_job_step($1, $2, $3, $4::jsonb) as ok`,
        [jobId, worker, step, JSON.stringify(output)],
      );
      return rows[0]!.ok;
    },

    async complete(jobId, worker) {
      const { rows } = await db.query<{ ok: boolean }>(`select public.complete_job($1, $2) as ok`, [
        jobId,
        worker,
      ]);
      return rows[0]!.ok;
    },

    async yield(jobId, worker) {
      const { rows } = await db.query<{ ok: boolean }>(`select public.yield_job($1, $2) as ok`, [
        jobId,
        worker,
      ]);
      return rows[0]!.ok;
    },

    async fail(jobId, worker, error, retryInSeconds) {
      const { rows } = await db.query<{ status: string | null }>(
        `select public.fail_job($1, $2, $3, $4) as status`,
        [jobId, worker, error, retryInSeconds],
      );
      const status = rows[0]?.status ?? null;
      return status === 'queued' || status === 'dead' ? status : null;
    },

    async stats(types): Promise<QueueStats> {
      const { rows } = await db.query<{
        claimable: number;
        running: number;
        stale_queued: number;
        unhandled: number;
      }>(`select * from public.queue_stats($1::text[])`, [types]);
      const row = rows[0]!;
      return {
        claimable: row.claimable,
        running: row.running,
        staleQueued: row.stale_queued,
        unhandled: row.unhandled,
      };
    },

    async reap(staleAfterSeconds): Promise<ReapedJob[]> {
      const { rows } = await db.query<{ job_id: string; job_type: string; outcome: string }>(
        `select * from public.reap_jobs($1)`,
        [staleAfterSeconds],
      );
      return rows.map((r) => ({
        jobId: r.job_id,
        jobType: r.job_type,
        outcome: r.outcome === 'dead' ? 'dead' : 'queued',
      }));
    },
  };
}
