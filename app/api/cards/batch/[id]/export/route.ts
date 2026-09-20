import { fail, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { env } from '@/lib/env';

/**
 * GET /api/cards/batch/[id]/export — CSV of code + full URL (spec §15.2).
 *
 * This file is the input to the NFC writing step (§29.2): the rep opens it, and
 * writes each URL to a sticker with NFC Tools, about 30 seconds each. The URL
 * column must therefore be EXACTLY what goes on the tag — `https://taplead.app/c/CODE`
 * — because a tag is written once and can never be re-pointed.
 */
export const GET = withRep(async (rep, _request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const db = serviceClient();

  const { data: batch } = await db
    .from('card_batches')
    .select('id, label, created_at')
    .eq('id', id)
    .eq('user_id', rep.userId)
    .maybeSingle();

  if (!batch) return fail('batch_not_found', 404);

  const { data: cards } = await db
    .from('cards')
    .select('code, status')
    .eq('batch_id', batch.id)
    .eq('user_id', rep.userId)
    .order('created_at', { ascending: true });

  const origin = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');

  const rows = [
    'code,url,status',
    ...(cards ?? []).map((card) => `${card.code},${origin}/c/${card.code},${card.status}`),
  ];

  const filename = `taplead-cards-${slug(batch.label) || batch.id.slice(0, 8)}.csv`;

  return new Response(rows.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
});

function slug(value: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
