import { notFound } from 'next/navigation';
import { getEvent, getSessionForRep, listEvents } from '@/lib/db/rep';
import { serviceClient } from '@/lib/db/service';
import { env } from '@/lib/env';
import { requireRep } from '@/lib/db/server';
import { DetailsForm } from './details-form';

export const metadata = { title: 'Add details' };
export const dynamic = 'force-dynamic';

/**
 * Phase two of capture (spec §10.2): the rep steps aside and fills this in,
 * minutes after the handover. This is where the full capture form lives — not at
 * the table.
 *
 * Sessions can be reopened and edited at any time, before or after the prospect
 * taps. There is no "locked after save".
 */
export default async function EditSessionPage({
  params,
  searchParams,
}: PageProps<'/sessions/[id]/edit'>) {
  const rep = await requireRep();
  const { id } = await params;
  const { registered } = await searchParams;

  const session = await getSessionForRep(rep.userId, id);
  if (!session) notFound();

  const [event, events, { data: card }] = await Promise.all([
    getEvent(rep.userId, session.event_id),
    listEvents(rep.userId),
    serviceClient()
      .from('cards')
      .select('code')
      .eq('id', session.card_id)
      .eq('user_id', rep.userId)
      .maybeSingle(),
  ]);

  return (
    <DetailsForm
      session={session}
      niches={event?.niches ?? []}
      eventName={event?.name ?? null}
      cardCode={card?.code ?? ''}
      events={events.map((e) => ({ id: e.id, name: e.name }))}
      lookupEnabled={Boolean(env.SEARCH_PROVIDER)}
      justRegistered={registered === '1'}
    />
  );
}
