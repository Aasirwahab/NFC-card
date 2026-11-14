import { fail, json, withRep } from '@/lib/api';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import { serviceClient } from '@/lib/db/service';
import { screenQrExpiresAt, type ScreenQrStatus } from '@/lib/cards/screen';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

export const GET = withRep(
  async (rep, _request, context: { params: Promise<{ code: string }> }) => {
    const code = normaliseCode((await context.params).code);
    if (!isValidCode(code)) return fail('invalid_request', 400);
    const limit = await checkRateLimit('landingStatus', `screen:${rep.userId}`);
    if (!limit.allowed) return fail('rate_limited', 429);

    const db = serviceClient();
    const { data: card, error } = await db
      .from('cards')
      .select('id, status, screen_issued_at')
      .eq('code', code)
      .eq('user_id', rep.userId)
      .maybeSingle();
    if (error) throw new Error('screen_qr_status_failed');
    if (!card?.screen_issued_at) return fail('not_found', 404);

    const { data: session, error: sessionError } = await db
      .from('sessions')
      .select('id')
      .eq('card_id', card.id)
      .eq('user_id', rep.userId)
      .eq('status', 'active')
      .maybeSingle();
    if (sessionError) throw new Error('screen_qr_status_failed');
    // Binding is the scan. The subsequent view-counter write can finish later.
    const status: ScreenQrStatus = session
      ? { status: 'scanned', sessionId: session.id }
      : (card.status !== 'available' && !session) ||
          Date.now() >= screenQrExpiresAt(card.screen_issued_at)
        ? { status: 'expired' }
        : { status: 'waiting' };
    return json(status, { headers: { 'cache-control': 'no-store' } });
  },
);
