import 'server-only';
import { serviceClient } from '@/lib/db/service';
import { audit } from './audit';

export type StaffTap = 'verified' | 'already_verified' | 'not_applicable';

/**
 * A staff member tapped a card that is still unused: the tap is the programming
 * check, not a lead.
 *
 *   - `verified`: first check, recorded now.
 *   - `already_verified`: tapped again before it was ever used. Still a check, and
 *     it must not file a lead for the rep, so the caller shows the same page.
 *   - `not_applicable`: in use, lost or unknown. Behaves like any other visit.
 */
export async function verifyCardTap(code: string, staffEmail: string): Promise<StaffTap> {
  const db = serviceClient();
  const now = new Date().toISOString();

  const { data } = await db
    .from('cards')
    .update({ verified_at: now })
    .eq('code', code)
    .eq('status', 'available')
    .is('verified_at', null)
    .select('code');
  if (!data?.length) {
    const { data: again } = await db
      .from('cards')
      .select('code')
      .eq('code', code)
      .eq('status', 'available')
      .not('verified_at', 'is', null)
      .maybeSingle();
    return again ? 'already_verified' : 'not_applicable';
  }

  // A tap proves the write, so a card verified without "I wrote it" is also written.
  await db.from('cards').update({ written_at: now }).eq('code', code).is('written_at', null);
  await audit({ actor: staffEmail, action: 'mark_verified', code, meta: { by: 'tap' } });
  return 'verified';
}
