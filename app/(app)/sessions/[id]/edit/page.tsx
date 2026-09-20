import { notFound } from 'next/navigation';
import { getEvent, getSessionForRep } from '@/lib/db/rep';
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

  const event = await getEvent(rep.userId, session.event_id);

  return (
    <DetailsForm
      session={session}
      niches={event?.niches ?? []}
      eventName={event?.name ?? null}
      justRegistered={registered === '1'}
    />
  );
}
