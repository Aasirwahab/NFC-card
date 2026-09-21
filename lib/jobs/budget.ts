/**
 * The time budget that turns a serverless function into durable execution
 * (spec §13, "the one thing to get right").
 *
 * Before each pipeline step, the runner asks whether the step will FIT in what
 * is left of the invocation. If it will not, the job checkpoints and re-queues
 * instead of starting it. Without this, a long research pass is killed mid-step
 * by the platform timeout and burns an attempt every time — so a perfectly
 * healthy job can die of being slow.
 *
 * PURE: the clock is injected.
 */

export type Budget = {
  /** Milliseconds until the deadline. Negative once it has passed. */
  remainingMs(): number;
  /** Whether work estimated to take `estimateMs` can start and finish in time. */
  fits(estimateMs: number): boolean;
};

/**
 * @param totalMs  how long this invocation may run, already net of any reserve
 *                 kept back for the final database writes
 * @param now      the clock; defaults to Date.now
 */
export function createBudget(totalMs: number, now: () => number = Date.now): Budget {
  const deadline = now() + totalMs;
  return {
    remainingMs: () => deadline - now(),
    fits: (estimateMs) => deadline - now() >= estimateMs,
  };
}
