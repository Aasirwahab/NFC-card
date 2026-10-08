import { NextResponse } from 'next/server';
import { getStaff } from '@/lib/auth/staff';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import { serviceClient } from '@/lib/db/service';
import { audit } from '@/lib/ops/audit';
import { normaliseTagUid } from '@/lib/ops/nfc-helper';

/**
 * GET /ops/cards/[code]/written?tagid=… — where NFC Helper sends the phone back
 * after writing a sticker. Marks the card written and remembers the sticker's
 * serial number, then returns to the writing page.
 *
 * It changes state on a GET, so it is staff-only and idempotent: the update only
 * applies to an unused card that is not yet verified, and a second call with the
 * same sticker changes nothing. Anyone else gets a 404.
 */
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const staff = await getStaff();
  if (!staff) return new NextResponse('Not found', { status: 404 });

  const code = normaliseCode((await context.params).code);
  if (!isValidCode(code)) return new NextResponse('Not found', { status: 404 });

  const url = new URL(request.url);
  const uid = normaliseTagUid(url.searchParams.get('tagid'));
  const db = serviceClient();

  const { data: card } = await db
    .from('cards')
    .select('batch_id, status, verified_at')
    .eq('code', code)
    .maybeSingle();
  if (!card) return new NextResponse('Not found', { status: 404 });

  const back = (query: string) =>
    NextResponse.redirect(
      new URL(
        card.batch_id ? `/ops/batches/${card.batch_id}${query}` : `/ops/cards/${code}${query}`,
        url,
      ),
      303,
    );

  if (card.status !== 'available' || card.verified_at) return back('?error=not_writable');

  const { data, error } = await db
    .from('cards')
    .update({ written_at: new Date().toISOString(), tag_uid: uid })
    .eq('code', code)
    .eq('status', 'available')
    .is('verified_at', null)
    .select('code');

  // The unique index refuses one sticker being written for two cards.
  if (error) return back(error.code === '23505' ? '?error=tag_in_use' : '?error=failed');
  if (data?.length) {
    await audit({
      actor: staff.email,
      action: 'mark_written',
      code,
      meta: { by: 'nfc_helper', tag: uid ? `…${uid.slice(-4)}` : null },
    });
  }
  return back('');
}
