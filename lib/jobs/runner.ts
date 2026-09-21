import { retryDelaySeconds } from './backoff';
import type { Budget } from './budget';
import {
  PermanentJobError,
  RestartJobError,
  type Handlers,
  type Job,
  type JobContext,
  type JobStore,
  type RunOutcome,
  type StepOutput,
} from './types';

/**
 * The job runner (spec §13).
 *
 * Pure orchestration over a JobStore: no database client, no HTTP, no clock of
 * its own. That is what lets the integration suite drive it against the real SQL
 * with a controllable budget, and assert the Phase 3 done-when criteria directly.
 */

export type RunnerDeps = {
  store: JobStore;
  handlers: Handlers;
  /** Unique per invocation. Every write is conditional on still holding the lock. */
  worker: string;
  budget: Budget;
  /** For backoff jitter. Injected so tests are deterministic. */
  random: () => number;
  /** Called when a job is dead-lettered (§24.2: "any job reaches dead"). */
  alert: (event: string, details: Record<string, unknown>) => void;
};

/** Do not claim a job with less than this left: it would only yield immediately. */
export const MIN_START_MS = 15_000;

class YieldSignal extends Error {
  constructor(readonly delaySeconds = 0) {
    super(
      delaySeconds > 0
        ? `deferred for ${delaySeconds}s`
        : 'out of time — yielding before the next step',
    );
    this.name = 'YieldSignal';
  }
}

class LostLockError extends Error {
  constructor() {
    super('this worker no longer holds the job');
    this.name = 'LostLockError';
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function contextFor(job: Job, deps: RunnerDeps): JobContext {
  // A local copy of the checkpoints, so a step saved earlier in THIS invocation
  // is also resumable without another read.
  const steps: Record<string, StepOutput> = {
    ...((job.steps as Record<string, StepOutput> | null) ?? {}),
  };

  return {
    job,
    async step<T extends StepOutput>(name: string, estimateMs: number, fn: () => Promise<T>) {
      if (Object.hasOwn(steps, name)) {
        return steps[name] as T;
      }

      if (!deps.budget.fits(estimateMs)) {
        throw new YieldSignal();
      }

      const output = await fn();

      if (!(await deps.store.saveStep(job.id, deps.worker, name, output))) {
        // Reaped while this step ran. Its result is discarded: whoever holds
        // the job now will run the step again under their own lock.
        throw new LostLockError();
      }

      steps[name] = output;
      return output;
    },
    defer(delaySeconds: number): never {
      throw new YieldSignal(Math.max(0, Math.round(delaySeconds)));
    },
  };
}

/** Claims and runs one job. `idle` when there is nothing this worker can run. */
export async function runNext(deps: RunnerDeps): Promise<RunOutcome> {
  const types = Object.keys(deps.handlers);
  if (types.length === 0) return { kind: 'idle' };

  const job = await deps.store.claim(deps.worker, types);
  if (!job) return { kind: 'idle' };

  const handler = deps.handlers[job.type];
  const base = { jobId: job.id, type: job.type };

  try {
    if (!handler) {
      // Unreachable while claim filters by type, but a missing handler must be
      // a permanent failure rather than a retry loop.
      throw new PermanentJobError(`no handler registered for job type "${job.type}"`);
    }

    await handler(contextFor(job, deps));

    return (await deps.store.complete(job.id, deps.worker))
      ? { kind: 'succeeded', ...base }
      : { kind: 'lost_lock', ...base };
  } catch (error) {
    if (error instanceof YieldSignal) {
      return (await deps.store.yield(job.id, deps.worker, error.delaySeconds))
        ? { kind: 'yielded', ...base }
        : { kind: 'lost_lock', ...base };
    }

    if (error instanceof RestartJobError) {
      return (await deps.store.restart(job.id, deps.worker))
        ? { kind: 'restarted', ...base, reason: error.message }
        : { kind: 'lost_lock', ...base };
    }

    if (error instanceof LostLockError) {
      return { kind: 'lost_lock', ...base };
    }

    const message = describe(error);
    const retryIn =
      error instanceof PermanentJobError ? null : retryDelaySeconds(job.attempts, deps.random);

    const status = await deps.store.fail(job.id, deps.worker, message, retryIn);

    if (status === null) return { kind: 'lost_lock', ...base };

    if (status === 'dead') {
      deps.alert('job_dead', {
        jobId: job.id,
        type: job.type,
        sessionId: job.session_id,
        attempts: job.attempts,
        error: message,
      });
      return { kind: 'dead', ...base, error: message, attempts: job.attempts };
    }

    return { kind: 'retrying', ...base, error: message, retryInSeconds: retryIn ?? 0 };
  }
}

/**
 * Runs jobs until the queue is empty, the budget is spent, or `maxJobs` have
 * run. Stops after a yield: a yield means the budget is nearly gone, and the
 * caller re-kicks so a fresh invocation picks the job straight back up.
 */
export async function drain(deps: RunnerDeps, maxJobs: number): Promise<RunOutcome[]> {
  const outcomes: RunOutcome[] = [];

  while (outcomes.length < maxJobs && deps.budget.fits(MIN_START_MS)) {
    const outcome = await runNext(deps);
    if (outcome.kind === 'idle') break;

    outcomes.push(outcome);
    if (outcome.kind === 'yielded') break;
  }

  return outcomes;
}
