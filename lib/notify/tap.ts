import { tapAlertEmail } from '@/lib/email/tap-alert';
import type { Mailer } from '@/lib/email/mailer';
import { PermanentJobError, type JobHandler } from '@/lib/jobs/types';

/**
 * The `notify_tap` job: "Tom just opened your card" (Phase 5).
 *
 * Enqueued by record_prospect_view in the SAME transaction that sets
 * first_viewed_at, so there is exactly one job per prospect, and every §10.4
 * exclusion (rep self-taps, bots, link previews, repeat views) has already been
 * applied before it exists.
 *
 * All I/O is injected, like the enrichment pipeline: production wires Supabase
 * and Resend (deps.ts), the tests wire fakes and run this exact code.
 */

export type TapAlertData = {
  status: string;
  /** The rep's own sign-in address. Null when the account has none. */
  to: string | null;
  repFirstName: string;
  prospectName: string | null;
  prospectCompany: string | null;
  problem: string | null;
  eventName: string | null;
};

export type NotifyTapDeps = {
  load(sessionId: string): Promise<TapAlertData | null>;
  send: Mailer;
  appUrl: string;
  log(event: string, details: Record<string, unknown>): void;
};

export function createNotifyTapHandler(deps: NotifyTapDeps): JobHandler {
  return async (context) => {
    const sessionId = context.job.session_id;
    if (!sessionId) throw new PermanentJobError('notify_tap job has no session');

    const data = await deps.load(sessionId);

    // Voided since the tap, or deleted: there is no lead left to call about.
    if (!data || data.status !== 'active') {
      deps.log('tap_alert_skipped', { sessionId, reason: data ? data.status : 'missing' });
      return;
    }

    if (!data.to) {
      deps.log('tap_alert_skipped', { sessionId, reason: 'no_rep_email' });
      return;
    }

    const email = tapAlertEmail({
      repFirstName: data.repFirstName,
      prospectName: data.prospectName,
      prospectCompany: data.prospectCompany,
      problem: data.problem,
      eventName: data.eventName,
      sessionUrl: new URL(`/sessions/${sessionId}/edit`, deps.appUrl).toString(),
    });

    // Checkpointed, so a retry after a successful send does not run it again;
    // the idempotency key covers the gap between the send and the checkpoint.
    const result = await context.step('send', 15_000, () =>
      deps.send({ to: data.to!, ...email, idempotencyKey: `notify_tap:${sessionId}` }),
    );

    deps.log('tap_alert', { sessionId, result });
  };
}
