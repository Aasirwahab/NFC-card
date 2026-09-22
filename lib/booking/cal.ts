import { z } from 'zod';
import { SESSION_METADATA_KEY } from './link';

/**
 * Reading the Cal.com booking webhook (spec §19.1). PURE — no I/O — so each rule
 * is unit-tested. Server-side only in practice: the browser needs just ./link.
 *
 * The calendar is never rebuilt: the prospect page embeds the rep's own Cal.com
 * event, passing the session id as booking metadata, and the webhook links the
 * booking back to the session from that metadata.
 */

const webhookSchema = z.object({
  triggerEvent: z.string(),
  payload: z
    .object({
      uid: z.string().min(1).max(200),
      startTime: z.string().optional(),
      attendees: z
        .array(z.object({ email: z.string().optional(), name: z.string().optional() }))
        .optional(),
      metadata: z.record(z.string(), z.unknown()).optional().nullable(),
      rescheduleUid: z.string().optional().nullable(),
    })
    .passthrough(),
});

const STATUS: Record<string, 'confirmed' | 'cancelled'> = {
  BOOKING_CREATED: 'confirmed',
  BOOKING_RESCHEDULED: 'confirmed',
  BOOKING_CANCELLED: 'cancelled',
};

export type BookingChange = {
  uid: string;
  status: 'confirmed' | 'cancelled';
  /** Null when the metadata is missing or not a UUID — the booking is kept, unlinked. */
  sessionId: string | null;
  startsAt: string | null;
  email: string | null;
  name: string | null;
  /** The booking this one replaces, for BOOKING_RESCHEDULED. */
  rescheduledFrom: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The booking change a webhook describes, or null for an event this product does
 * not track (payments, no-shows, meeting started…) or a body it cannot read.
 */
export function readCalWebhook(body: unknown): BookingChange | null {
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) return null;

  const status = STATUS[parsed.data.triggerEvent];
  if (!status) return null;

  const { payload } = parsed.data;
  const sessionId = payload.metadata?.[SESSION_METADATA_KEY];
  const startsAt =
    payload.startTime && !Number.isNaN(Date.parse(payload.startTime)) ? payload.startTime : null;
  const attendee = payload.attendees?.[0];

  return {
    uid: payload.uid,
    status,
    sessionId: typeof sessionId === 'string' && UUID.test(sessionId) ? sessionId : null,
    startsAt,
    email: attendee?.email?.trim().slice(0, 254) || null,
    name: attendee?.name?.trim().slice(0, 200) || null,
    rescheduledFrom:
      parsed.data.triggerEvent === 'BOOKING_RESCHEDULED' ? (payload.rescheduleUid ?? null) : null,
  };
}
