import type { Handlers } from './types';

/**
 * Job handlers, keyed by `jobs.type`. Only the types listed here are ever
 * claimed (claim_jobs filters by type), so a job with no handler waits in the
 * queue untouched instead of being failed and dead-lettered.
 *
 * PHASE 3 REGISTERS NONE. The only job type that exists today is `enrich`, and
 * its handler IS the Phase 4 pipeline (§14). Until then, enrich jobs stay queued,
 * attempts untouched, and the landing page does what it already does for a
 * queued session: the crafting state, then the template pitch at 90 seconds —
 * one of the four designed states, not a failure (§16).
 *
 * Registering a placeholder here would be worse than registering nothing: it
 * would claim real jobs, fail them, and mark real sessions `failed`.
 */
export const handlers: Handlers = {};
