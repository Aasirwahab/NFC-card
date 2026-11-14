import 'server-only';
import { resolveCode, shownPitch } from '@/lib/db/landing';
import { serviceClient } from '@/lib/db/service';
import { parseBookingUrl } from '@/lib/booking/link';
import { env } from '@/lib/env';
import { emailConfigured, sendEmail } from './mailer';
import { pitchEmail } from './pitch-email';

/** Delivery runs from the existing queue even after the prospect closes the page. */
export async function sendProspectNoteEmail(sessionId: string): Promise<'held' | void> {
  if (!emailConfigured()) return;
  const db = serviceClient();
  const { data: session, error } = await db
    .from('sessions')
    .select(
      'card_id, user_id, status, prospect_email, prospect_submitted_email, prospect_consent_at',
    )
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw new Error('Could not load prospect delivery');
  if (
    !session ||
    session.status !== 'active' ||
    !session.prospect_submitted_email ||
    !session.prospect_consent_at ||
    (session.prospect_email && session.prospect_email !== session.prospect_submitted_email)
  )
    return;

  const { data: card, error: cardError } = await db
    .from('cards')
    .select('code')
    .eq('id', session.card_id)
    .maybeSingle();
  if (cardError) throw new Error('Could not load delivery card');
  if (!card) return;
  const resolved = await resolveCode(card.code, null);
  if (resolved.audience !== 'prospect') throw new Error('Prospect page unavailable');
  if (resolved.session.id !== sessionId) return;
  if (resolved.held) return 'held';

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('contact_email')
    .eq('id', session.user_id)
    .maybeSingle();
  if (profileError) throw new Error('Could not load delivery reply address');

  const { error: claimError } = await db.from('session_events').insert({
    session_id: sessionId,
    type: 'prospect_note_emailed',
  });
  if (claimError?.code === '23505') return;
  if (claimError) throw new Error('Could not claim prospect delivery');

  let delivered = false;
  try {
    const live = await resolveCode(card.code, null);
    if (live.audience !== 'prospect' || live.session.id !== sessionId) return;
    if (live.held) return 'held';
    const { data: current, error: recheckError } = await db
      .from('sessions')
      .select('status, prospect_email, prospect_submitted_email, prospect_consent_at')
      .eq('id', sessionId)
      .maybeSingle();
    if (recheckError) throw new Error('Could not recheck prospect delivery');
    if (
      !current ||
      current.status !== 'active' ||
      !current.prospect_consent_at ||
      current.prospect_submitted_email !== session.prospect_submitted_email ||
      (current.prospect_email && current.prospect_email !== current.prospect_submitted_email)
    )
      return;

    // A removal after the mailer call starts cannot undo delivery.
    const result = await sendEmail({
      to: session.prospect_submitted_email,
      ...pitchEmail({
        prospectName: live.session.prospect_name,
        repFullName: live.rep.fullName,
        repTitle: live.rep.title,
        businessName: live.business?.companyName ?? null,
        pitch: shownPitch(live),
        pageUrl: new URL(`/c/${card.code}`, env.NEXT_PUBLIC_APP_URL).toString(),
        hasBooking: Boolean(parseBookingUrl(live.rep.bookingUrl)),
      }),
      replyTo: profile?.contact_email ?? undefined,
      // Covers a worker retry between the send and its durable event/checkpoint.
      idempotencyKey: `prospect_note:${sessionId}`,
    });
    if (result !== 'sent') return;
    delivered = true;
    const { error: recordError } = await db.from('session_events').insert({
      session_id: sessionId,
      type: 'page_emailed',
    });
    if (recordError) throw new Error('Could not record prospect delivery');
  } finally {
    if (!delivered) {
      const { error: releaseError } = await db
        .from('session_events')
        .delete()
        .eq('session_id', sessionId)
        .eq('type', 'prospect_note_emailed');
      if (releaseError) throw new Error('Could not release prospect delivery');
    }
  }
}
