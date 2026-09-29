import 'server-only';
import { serviceClient } from '@/lib/db/service';
import { shouldRecordTap, viewSource } from '@/lib/domain/audience';
import { VIEW_DEDUPE_SECONDS, viewDedupeKey } from '@/lib/domain/bots';
import { kickWorkers } from '@/lib/jobs/kick';
import { claimOnce } from '@/lib/security/once';

type OwnerTap = {
  code: string;
  ownerId: string;
  cardStatus: string;
  /** A live session with no details, when there is one. */
  sessionId: string | null;
  userAgent: string | null;
  ip: string;
  src: string | string[] | undefined;
  /** The value of the rep-device cookie, if any. */
  deviceCookie: string | undefined;
};

/**
 * A prospect opened a card that has no researched brief (operating model v2).
 *
 * They see the rep's portfolio either way; this only makes sure the tap is not
 * lost. An unused card gets its session now, filed under the event that is on, so
 * the rep finds a "tapped, no details" lead to complete. A card whose session has
 * no details yet just has the view recorded, which queues the tap alert.
 *
 * Same gate as every other tap (§10.4): the owner's own device, crawlers and a
 * repeat from the same IP inside a minute are not a tap.
 */
export async function recordOwnerCardTap(tap: OwnerTap): Promise<void> {
  const ownerDevice = tap.deviceCookie === tap.ownerId;
  const dedupeKey = viewDedupeKey(tap.sessionId ?? `card:${tap.code}`, tap.ip);
  const firstInWindow = await claimOnce(dedupeKey, VIEW_DEDUPE_SECONDS);

  if (
    !shouldRecordTap({ audience: 'prospect', userAgent: tap.userAgent, firstInWindow, ownerDevice })
  ) {
    return;
  }

  const db = serviceClient();
  let sessionId = tap.sessionId;

  if (sessionId === null) {
    if (tap.cardStatus !== 'available') return; // released or voided: nothing to file

    const { data: created, error } = await db.rpc('tap_register_card', {
      p_session_id: crypto.randomUUID(),
      p_code: tap.code,
      p_user_id: tap.ownerId,
      p_registered_by: 'prospect_tap',
    });

    if (error) {
      // Two people tapping at once: the other tap won, and its view is recorded.
      if (!(error.message ?? '').includes('card_already_assigned')) {
        console.error(
          JSON.stringify({
            event: 'first_tap_register_failed',
            code: tap.code,
            error: error.message,
          }),
        );
      }
      return;
    }
    sessionId = created.id;
  }

  const { data: wasFirst, error: viewError } = await db.rpc('record_prospect_view', {
    p_session_id: sessionId,
    p_source: viewSource(tap.src),
  });

  if (viewError) {
    console.error(
      JSON.stringify({ event: 'record_view_failed', sessionId, error: viewError.message }),
    );
    return;
  }

  if (wasFirst) {
    try {
      await kickWorkers();
    } catch (kickError) {
      console.error(
        JSON.stringify({
          event: 'kick_failed',
          sessionId,
          error: kickError instanceof Error ? kickError.message : String(kickError),
        }),
      );
    }
  }
}
