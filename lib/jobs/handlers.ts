import 'server-only';
import { pitchUsesMock } from '@/lib/ai/models';
import { productionEnrichDeps } from '@/lib/enrich/deps';
import { createEnrichHandler } from '@/lib/enrich/pipeline';
import { env } from '@/lib/env';
import { productionFollowupDeps } from '@/lib/followup/deps';
import { createFollowupHandler } from '@/lib/followup/handler';
import { createEventDigestHandler } from '@/lib/notify/digest';
import { productionEventDigestDeps } from '@/lib/notify/digest-deps';
import { productionNotifyTapDeps } from '@/lib/notify/deps';
import { createNotifyTapHandler } from '@/lib/notify/tap';
import type { Handlers } from './types';

/**
 * Job handlers, keyed by `jobs.type`. Only the types listed here are ever
 * claimed (claim_jobs filters by type), so a job with no handler waits in the
 * queue untouched rather than being failed and dead-lettered.
 *
 * `enrich` — the Phase 4 pipeline — is registered EXCEPT in production while
 * the pitch model is still the offline mock. The mock proves the plumbing; it
 * cannot write a pitch worth sending. A real prospect must get either a real
 * model's pitch or the designed template (§16), never canned mock text — so on
 * a production deploy with no provider configured, enrich jobs wait and the
 * landing page falls back to the template exactly as it did before Phase 4.
 */
const enrichEnabled = !(env.VERCEL_ENV === 'production' && pitchUsesMock());

if (!enrichEnabled) {
  console.warn(
    JSON.stringify({
      event: 'enrich_disabled',
      reason: 'production deploy with MODEL_PITCH=mock; prospects get the template pitch',
    }),
  );
}

/**
 * `notify_tap` — "Tom just opened your card" (Phase 5). Always registered: with
 * no Resend key the send is logged and skipped, so it never needs gating.
 */
const notifyTap: Handlers[string] = (context) =>
  createNotifyTapHandler(productionNotifyTapDeps())(context);

/**
 * `event_digest` — the morning-after event email (2026-09-25 review). Always
 * registered, for the same reason as notify_tap.
 */
const eventDigest: Handlers[string] = (context) =>
  createEventDigestHandler(productionEventDigestDeps())(context);

/**
 * `followup` — the no-tap draft (§19.3). A deterministic template, no model call,
 * so it is always registered.
 */
const followup: Handlers[string] = (context) =>
  createFollowupHandler(productionFollowupDeps())(context);

export const handlers: Handlers = enrichEnabled
  ? {
      enrich: (context) => createEnrichHandler(productionEnrichDeps())(context),
      notify_tap: notifyTap,
      event_digest: eventDigest,
      followup,
    }
  : { notify_tap: notifyTap, event_digest: eventDigest, followup };
