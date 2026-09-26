import 'server-only';
import { serviceClient } from '@/lib/db/service';
import { sendEmail } from '@/lib/email/mailer';
import { env } from '@/lib/env';
import type { EventDigestData, EventDigestDeps } from './digest';

/** Production wiring for the event_digest handler: Supabase and Resend. */
export function productionEventDigestDeps(): EventDigestDeps {
  const db = serviceClient();

  return {
    async load(eventId, userId): Promise<EventDigestData | null> {
      const { data: event } = await db
        .from('events')
        .select('name')
        .eq('id', eventId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!event) return null;

      const { data: sessions } = await db
        .from('sessions')
        .select(
          'id, event_sequence_number, colour_tag, prospect_name, details_completed_at, first_viewed_at, linkedin_url, prospect_email',
        )
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('event_sequence_number', { ascending: true });
      const rows = sessions ?? [];

      const ids = rows.map((s) => s.id);
      const [{ count: booked }, { data: profile }, { data: user }] = await Promise.all([
        ids.length
          ? db
              .from('bookings')
              .select('id', { count: 'exact', head: true })
              .in('session_id', ids)
              .eq('status', 'confirmed')
          : Promise.resolve({ count: 0 }),
        db.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
        // The rep's own sign-in address: the digest is private to them.
        db.auth.admin.getUserById(userId),
      ]);

      const fullName = profile?.full_name?.trim() || 'there';

      return {
        to: user?.user?.email ?? null,
        repFirstName: fullName.split(/\s+/)[0] ?? fullName,
        eventName: event.name,
        handedOut: rows.length,
        opened: rows.filter((s) => s.first_viewed_at).length,
        booked: booked ?? 0,
        needsDetails: rows
          .filter((s) => !s.details_completed_at)
          .map((s) => ({
            sequence: s.event_sequence_number,
            colour: s.colour_tag,
            firstName: s.prospect_name?.trim().split(/\s+/)[0] ?? null,
          })),
        noChannel: rows.filter(
          (s) => s.details_completed_at && !s.linkedin_url && !s.prospect_email,
        ).length,
      };
    },
    send: sendEmail,
    appUrl: env.NEXT_PUBLIC_APP_URL,
    log(event, details) {
      console.log(JSON.stringify({ event, ...details }));
    },
  };
}
