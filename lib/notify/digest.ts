import { eventDigestEmail, type DigestCard } from '@/lib/email/event-digest';
import type { Mailer } from '@/lib/email/mailer';
import { PermanentJobError, type JobHandler } from '@/lib/jobs/types';

/**
 * The `event_digest` job: the morning-after email (2026-09-25 review).
 *
 * Enqueued by queue_event_digests() from the minute cron, once per event per
 * round. Round 1 always goes out; round 2 only while cards still need details.
 * All I/O is injected, like notify_tap.
 */

export type EventDigestData = {
  /** The rep's own sign-in address. Null when the account has none. */
  to: string | null;
  repFirstName: string;
  eventName: string;
  handedOut: number;
  opened: number;
  booked: number;
  needsDetails: DigestCard[];
  noChannel: number;
};

export type EventDigestDeps = {
  load(eventId: string, userId: string): Promise<EventDigestData | null>;
  send: Mailer;
  appUrl: string;
  log(event: string, details: Record<string, unknown>): void;
};

export function createEventDigestHandler(deps: EventDigestDeps): JobHandler {
  return async (context) => {
    const payload = context.job.payload as { event_id?: unknown; round?: unknown } | null;
    const eventId = typeof payload?.event_id === 'string' ? payload.event_id : null;
    const round = payload?.round === 2 ? 2 : payload?.round === 1 ? 1 : null;
    if (!eventId || !round) throw new PermanentJobError('event_digest job has a bad payload');

    const data = await deps.load(eventId, context.job.user_id);
    if (!data || data.handedOut === 0) {
      deps.log('event_digest_skipped', { eventId, round, reason: 'no_cards' });
      return;
    }
    if (round === 2 && data.needsDetails.length === 0) {
      deps.log('event_digest_skipped', { eventId, round, reason: 'nothing_missing' });
      return;
    }
    if (!data.to) {
      deps.log('event_digest_skipped', { eventId, round, reason: 'no_rep_email' });
      return;
    }

    const email = eventDigestEmail({
      round,
      repFirstName: data.repFirstName,
      eventName: data.eventName,
      handedOut: data.handedOut,
      opened: data.opened,
      booked: data.booked,
      needsDetails: data.needsDetails,
      noChannel: data.noChannel,
      dashboardUrl: new URL('/dashboard', deps.appUrl).toString(),
    });

    const result = await context.step('send', 15_000, () =>
      deps.send({ to: data.to!, ...email, idempotencyKey: `event_digest:${eventId}:${round}` }),
    );

    deps.log('event_digest', { eventId, round, result });
  };
}
