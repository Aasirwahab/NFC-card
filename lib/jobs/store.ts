import 'server-only';
import { serviceClient } from '@/lib/db/service';
import type { Job, JobStore, QueueStats, ReapedJob } from './types';

/**
 * The production JobStore: each method is one call to a job-lifecycle function
 * in the database (supabase/migrations/20260921111057_job_lifecycle.sql), so every
 * transition is a single statement and no lock outlives it.
 *
 * Errors from the database are thrown, not swallowed. A worker that cannot reach
 * the database cannot safely decide anything; the job stays `running` and the
 * reaper returns it to the queue.
 */
export const supabaseJobStore: JobStore = {
  async claim(worker, types) {
    const { data, error } = await serviceClient().rpc('claim_jobs', {
      p_worker: worker,
      p_limit: 1,
      p_types: types,
    });
    if (error) throw new Error(`claim_jobs failed: ${error.message}`);
    return (data as Job[] | null)?.[0] ?? null;
  },

  async saveStep(jobId, worker, step, output) {
    const { data, error } = await serviceClient().rpc('save_job_step', {
      p_job_id: jobId,
      p_worker: worker,
      p_step: step,
      p_output: output,
    });
    if (error) throw new Error(`save_job_step failed: ${error.message}`);
    return data === true;
  },

  async complete(jobId, worker) {
    const { data, error } = await serviceClient().rpc('complete_job', {
      p_job_id: jobId,
      p_worker: worker,
    });
    if (error) throw new Error(`complete_job failed: ${error.message}`);
    return data === true;
  },

  async yield(jobId, worker) {
    const { data, error } = await serviceClient().rpc('yield_job', {
      p_job_id: jobId,
      p_worker: worker,
    });
    if (error) throw new Error(`yield_job failed: ${error.message}`);
    return data === true;
  },

  async fail(jobId, worker, message, retryInSeconds) {
    const { data, error } = await serviceClient().rpc('fail_job', {
      p_job_id: jobId,
      p_worker: worker,
      p_error: message,
      p_retry_in_seconds: retryInSeconds,
    });
    if (error) throw new Error(`fail_job failed: ${error.message}`);
    return data === 'queued' || data === 'dead' ? data : null;
  },

  async stats(types): Promise<QueueStats> {
    const { data, error } = await serviceClient().rpc('queue_stats', { p_types: types });
    if (error) throw new Error(`queue_stats failed: ${error.message}`);
    const row = data?.[0];
    return {
      claimable: row?.claimable ?? 0,
      running: row?.running ?? 0,
      staleQueued: row?.stale_queued ?? 0,
      unhandled: row?.unhandled ?? 0,
    };
  },

  async reap(staleAfterSeconds): Promise<ReapedJob[]> {
    const { data, error } = await serviceClient().rpc('reap_jobs', {
      p_stale_after_seconds: staleAfterSeconds,
    });
    if (error) throw new Error(`reap_jobs failed: ${error.message}`);
    return (data ?? []).map((row) => ({
      jobId: row.job_id,
      jobType: row.job_type,
      outcome: row.outcome === 'dead' ? 'dead' : 'queued',
    }));
  },
};
