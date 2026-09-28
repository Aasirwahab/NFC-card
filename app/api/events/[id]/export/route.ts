import { fail, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { leadsCsv, type LeadRow } from '@/lib/domain/leads-csv';

/**
 * GET /api/events/[id]/export — the event's leads as CSV (spec §26 Phase 7).
 * Live sessions only; the private note is never exported (§23.1).
 */
export const GET = withRep(async (rep, _request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const db = serviceClient();

  const { data: event } = await db
    .from('events')
    .select('id, name')
    .eq('id', id)
    .eq('user_id', rep.userId)
    .maybeSingle();
  if (!event) return fail('event_not_found', 404);

  const { data: sessions } = await db
    .from('sessions')
    .select(
      'id, event_sequence_number, colour_tag, prospect_name, prospect_company, prospect_email, prospect_phone, linkedin_url, prospect_website, problems, custom_problems, registered_at, first_viewed_at',
    )
    .eq('event_id', id)
    .eq('user_id', rep.userId)
    .eq('status', 'active')
    .order('event_sequence_number', { ascending: true });

  const ids = (sessions ?? []).map((s) => s.id);
  const { data: bookings } = ids.length
    ? await db.from('bookings').select('session_id').in('session_id', ids).eq('status', 'confirmed')
    : { data: [] };
  const booked = new Set((bookings ?? []).map((b) => b.session_id));

  const rows: LeadRow[] = (sessions ?? []).map((s) => ({ ...s, booked: booked.has(s.id) }));
  const slug = event.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  return new Response(leadsCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="leads-${slug || event.id.slice(0, 8)}.csv"`,
      'cache-control': 'no-store',
    },
  });
});
