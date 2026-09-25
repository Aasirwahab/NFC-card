import { recordLandingEvent } from '@/lib/landing/record-event';

/**
 * POST /api/landing/[code]/booking-opened — "clicked Book" (spec §27, Phase 5).
 *
 * Records a booking_opened session event when the prospect opens the calendar.
 * Set against bookings, it says whether a low booking rate is the pitch or the
 * calendar. A count only, inside §6's "basic counts". Exclusions and dedupe live
 * in recordLandingEvent.
 */
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  return recordLandingEvent(code, 'booking_opened');
}
