import type { Json, Row } from '@/lib/db/types';

/**
 * The job runner's contracts (spec §13).
 *
 * `JobStore` is the seam between the runner's logic and the database. Production
 * implements it with the Supabase service client (store.ts); the integration
 * tests implement it over the in-process Postgres, running the SAME SQL
 * functions. The runner is therefore tested against real row locks and real
 * state transitions, not against a mock that agrees with whatever it is told.
 */

export type Job = Row<'jobs'>;

/** A step's checkpointed output must survive a round trip through jsonb. */
export type StepOutput = Json;

export type QueueStats = {
  claimable: number;
  running: number;
  /** Handled types queued for over 15 minutes — "kick and sweep are both failing". */
  staleQueued: number;
  /** Queued jobs of a type this deployment has no handler for. Waiting by design. */
  unhandled: number;
};

export type ReapedJob = { jobId: string; jobType: string; outcome: 'queued' | 'dead' };

export interface JobStore {
  /** Claims at most one due job of the given types. Null when there is none. */
  claim(worker: string, types: string[]): Promise<Job | null>;
  /** False when this worker no longer holds the job (it was reaped). */
  saveStep(jobId: string, worker: string, step: string, output: StepOutput): Promise<boolean>;
  complete(jobId: string, worker: string): Promise<boolean>;
  /** Re-queue without burning the attempt: the job ran out of time, not luck. */
  yield(jobId: string, worker: string): Promise<boolean>;
  /**
   * Retry after `retryInSeconds`, or dead-letter when attempts are spent. A null
   * delay is a permanent failure and dead-letters immediately. Returns the new
   * status, or null when this worker no longer holds the job.
   */
  fail(
    jobId: string,
    worker: string,
    error: string,
    retryInSeconds: number | null,
  ): Promise<'queued' | 'dead' | null>;
  stats(types: string[]): Promise<QueueStats>;
  reap(staleAfterSeconds: number): Promise<ReapedJob[]>;
}

export type JobContext = {
  job: Job;
  /**
   * Runs one checkpointed step (§14.1).
   *
   *   - Already checkpointed by an earlier attempt? Returns the saved output
   *     without running `fn` again. A retry RESUMES rather than restarts.
   *   - Will not fit in the remaining budget? The job yields and is re-queued
   *     before `fn` starts, so a timeout never kills a step halfway.
   *   - Otherwise runs `fn` and checkpoints its output before returning it.
   *
   * @param estimateMs  a realistic upper bound for this step. Too low and the
   *                    platform can kill the step anyway; too high and the job
   *                    yields more often than it needs to.
   */
  step<T extends StepOutput>(name: string, estimateMs: number, fn: () => Promise<T>): Promise<T>;
};

export type JobHandler = (context: JobContext) => Promise<void>;

/** Keyed by `jobs.type`. Only these types are ever claimed. */
export type Handlers = Readonly<Record<string, JobHandler>>;

/**
 * Throw from a handler when retrying can never succeed — the session was voided,
 * the input is malformed. The job goes straight to dead instead of spending its
 * remaining attempts, and minutes of backoff, on a certainty.
 */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

export type RunOutcome =
  | { kind: 'idle' }
  | { kind: 'succeeded'; jobId: string; type: string }
  | { kind: 'yielded'; jobId: string; type: string }
  | { kind: 'retrying'; jobId: string; type: string; error: string; retryInSeconds: number }
  | { kind: 'dead'; jobId: string; type: string; error: string; attempts: number }
  /** The reaper handed this job to someone else while we were working on it. */
  | { kind: 'lost_lock'; jobId: string; type: string };
