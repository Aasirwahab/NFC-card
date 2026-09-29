import { fail, json, readJson, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { lostCardSchema } from '@/lib/schemas/sessions';

/**
 * POST /api/cards/lost: the rep has lost an unused card. It is voided, so anyone
 * who finds it sees the portfolio and nothing else. A card that already has a
 * lead goes through the session's own void instead (409 card_in_use).
 */
export const POST = withRep(async (rep, request) => {
  const parsed = lostCardSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('invalid_request', 400);

  const { error } = await serviceClient().rpc('mark_card_lost', {
    p_code: parsed.data.code,
    p_user_id: rep.userId,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('card_not_found')) return fail('card_not_found', 404);
    if (message.includes('card_in_use')) return fail('card_in_use', 409);
    throw new Error(`mark_card_lost failed: ${message}`);
  }

  return json({ ok: true });
});
