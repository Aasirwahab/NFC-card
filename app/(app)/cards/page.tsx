import { serviceClient } from '@/lib/db/service';
import { requireRep } from '@/lib/db/server';
import { CardsOverview } from './cards-overview';

export const metadata = { title: 'Cards' };
export const dynamic = 'force-dynamic';

/**
 * The rep's cards (operating model v2). We issue batches to a rep's account with
 * `npm run cards:issue`; the rep sees what they hold and can open a card by code.
 */
export default async function CardsPage() {
  const rep = await requireRep();
  const db = serviceClient();

  const { data: batches } = await db
    .from('card_batches')
    .select('id, label, size, created_at')
    .eq('user_id', rep.userId)
    .order('created_at', { ascending: false });

  const { data: counts } = await db.from('cards').select('status').eq('user_id', rep.userId);

  const count = (status: string) => (counts ?? []).filter((c) => c.status === status).length;

  return (
    <CardsOverview
      batches={batches ?? []}
      inStock={count('available')}
      handedOut={count('assigned')}
      lost={count('voided')}
    />
  );
}
