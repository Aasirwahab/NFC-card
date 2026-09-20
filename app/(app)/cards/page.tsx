import { serviceClient } from '@/lib/db/service';
import { requireRep } from '@/lib/db/server';
import { BatchList } from './batch-list';

export const metadata = { title: 'Cards' };
export const dynamic = 'force-dynamic';

/**
 * Card batches (spec §15.2, §29.2).
 *
 * Generating a batch produces codes that get written to NTAG215 stickers and
 * handed to strangers. Tags are immutable, so `cards` can never be regenerated
 * (§24.4) — which is why the CSV export here is the one artefact that must be
 * kept somewhere safe until the tags are written.
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

  const available = (counts ?? []).filter((c) => c.status === 'available').length;
  const assigned = (counts ?? []).filter((c) => c.status === 'assigned').length;

  return <BatchList batches={batches ?? []} available={available} assigned={assigned} />;
}
