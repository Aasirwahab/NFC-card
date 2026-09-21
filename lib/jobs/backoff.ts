/**
 * Retry delay after a failed attempt (spec §13: "retry, backoff and
 * dead-lettering, written once").
 *
 * 60s, then 5 minutes, then the job is dead at the default max_attempts of 3.
 * Tuned for the failure that actually happens — a model provider blip or a rate
 * limit — rather than for throughput: a 60-lead event has a three-hour budget
 * before the first prospect taps, so there is no prize for retrying in seconds,
 * and retrying a rate-limited provider immediately only extends the outage.
 *
 * ±20% jitter so that a burst of jobs that failed together (the provider went
 * down) does not retry together and knock it straight back over.
 *
 * PURE: the randomness is injected, so the schedule is testable exactly.
 */

const BASE_SECONDS = 60;
const FACTOR = 5;
const CAP_SECONDS = 30 * 60;
const JITTER = 0.2;

/**
 * @param attempt  attempts made so far, INCLUDING the one that just failed (1-based)
 * @param random   a number in [0, 1)
 */
export function retryDelaySeconds(attempt: number, random: () => number): number {
  const n = Math.max(1, Math.trunc(attempt));
  const base = Math.min(BASE_SECONDS * FACTOR ** (n - 1), CAP_SECONDS);
  const jitter = 1 + (random() * 2 - 1) * JITTER;
  return Math.max(1, Math.round(base * jitter));
}
