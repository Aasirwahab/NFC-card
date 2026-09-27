import 'server-only';
import { eventResults, type EventResults, type ResultSession } from '@/lib/domain/event-results';
import { serviceClient } from './service';

/**
 * The pilot results for one of the rep's events. Scoped by user_id in every query
 * (the service role bypasses RLS). Null when the event is not theirs.
 */
export async function resultsForEvent(
  userId: string,
  eventId: string,
): Promise<{
  event: { id: string; name: string; event_date: string | null };
  results: EventResults;
} | null> {
  const db = serviceClient();

  const { data: event } = await db
    .from('events')
    .select('id, name, event_date')
    .eq('id', eventId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!event) return null;

  const { data: rows } = await db
    .from('sessions')
    .select(
      'id, status, registered_at, details_completed_at, first_viewed_at, first_view_source, chat_response_count, research',
    )
    .eq('event_id', eventId)
    .eq('user_id', userId);

  const sessions: ResultSession[] = (rows ?? []).map((s) => {
    const research = s.research as { domainSource?: unknown } | null;
    const source = research?.domainSource;
    return {
      id: s.id,
      status: s.status,
      registered_at: s.registered_at,
      details_completed_at: s.details_completed_at,
      first_viewed_at: s.first_viewed_at,
      first_view_source: s.first_view_source,
      chat_response_count: s.chat_response_count,
      domain_source:
        source === 'website' || source === 'email' || source === 'guess' ? source : null,
      has_research: research !== null,
    };
  });

  const ids = sessions.map((s) => s.id);
  const [{ data: events }, { data: bookings }, { data: ratings }] = ids.length
    ? await Promise.all([
        db
          .from('session_events')
          .select('session_id, type')
          .in('session_id', ids)
          .in('type', ['booking_opened', 'linkedin_opened', 'released']),
        db.from('bookings').select('session_id, status').in('session_id', ids),
        db
          .from('pitch_ratings')
          .select('session_id, rating')
          .in('session_id', ids)
          .eq('user_id', userId),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  return {
    event,
    results: eventResults({
      sessions,
      events: events ?? [],
      bookings: bookings ?? [],
      ratings: ratings ?? [],
    }),
  };
}
