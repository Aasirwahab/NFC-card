import { z } from 'zod';
import { fail, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { contactsCsv, type ContactExportRow } from '@/lib/export/contacts-csv';
import { checkRateLimit } from '@/lib/security/rate-limit';

const COLUMNS =
  'id, event_sequence_number, colour_tag, custom_problems, registered_at, prospect_name, prospect_company, ' +
  'prospect_email, prospect_submitted_email, prospect_phone, prospect_submitted_phone, ' +
  'linkedin_url, prospect_website, problems, prospect_picked_problems, first_viewed_at, ' +
  'view_count, followup_sent_at, followup_outcome, prospect_form_answers, ' +
  'events(name), bookings(status)';
const PAGE_SIZE = 500;

export const GET = withRep(async (rep, request) => {
  const limit = await checkRateLimit('contactsExport', rep.userId);
  if (!limit.allowed) return fail('rate_limited', 429);

  const eventId = new URL(request.url).searchParams.get('event');
  if (eventId !== null && !z.string().uuid().safeParse(eventId).success) {
    return fail('event_not_found', 404);
  }

  const db = serviceClient();
  let eventName: string | undefined;
  if (eventId !== null) {
    const { data: event, error } = await db
      .from('events')
      .select('name')
      .eq('id', eventId)
      .eq('user_id', rep.userId)
      .maybeSingle();
    if (error) throw new Error(`export event failed: ${error.message}`);
    if (!event) return fail('event_not_found', 404);
    eventName = event.name;
  }

  // Page explicitly so Supabase's row limit cannot silently truncate the export.
  const rows: ContactExportRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = db
      .from('sessions')
      .select(COLUMNS)
      .eq('user_id', rep.userId)
      .eq('status', 'active')
      .order('registered_at', { ascending: false })
      .order('id', { ascending: false });
    if (eventId !== null) query = query.eq('event_id', eventId);
    const { data, error } = await query
      .range(offset, offset + PAGE_SIZE - 1)
      .returns<ContactExportRow[]>();
    if (error) throw new Error(`export contacts failed: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const slug = eventName
    ?.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `insignar-contacts-${eventId !== null ? `${slug || eventId}-` : ''}${date}.csv`;
  return new Response(contactsCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
});
