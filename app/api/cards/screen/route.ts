import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { fail, json, readJson, withRep } from '@/lib/api';
import { generateCode } from '@/lib/domain/codes';
import { serviceClient } from '@/lib/db/service';
import { env } from '@/lib/env';
import { qrUrl } from '@/lib/cards/urls';
import { screenQrExpiresAt, type ScreenQr } from '@/lib/cards/screen';
import { checkRateLimit } from '@/lib/security/rate-limit';

const requestSchema = z.strictObject({});
const SCREEN_QR_PER_HOUR = 30; // same as the screenQr limit in lib/security/rate-limit.ts

export const POST = withRep(async (rep, request) => {
  if (!requestSchema.safeParse(await readJson(request)).success)
    return fail('invalid_request', 400);
  const db = serviceClient();
  const limit = await checkRateLimit('screenQr', rep.userId);
  // Without Redis, keep the same cap from the database rather than block a rep mid-event.
  if (limit.degraded) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await db
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', rep.userId)
      .gte('screen_issued_at', since);
    if (error) return fail('temporarily_unavailable', 503);
    if ((count ?? 0) >= SCREEN_QR_PER_HOUR) {
      return json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '600' } });
    }
  } else if (!limit.allowed) {
    return json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfter) } },
    );
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: card, error } = await db
      .from('cards')
      .insert({
        code: generateCode(randomBytes),
        user_id: rep.userId,
        screen_issued_at: new Date().toISOString(),
      })
      .select('code, screen_issued_at')
      .single();
    if (error?.code === '23505') continue;
    if (error || !card?.screen_issued_at) throw new Error('screen_qr_issue_failed');

    const url = qrUrl(env.NEXT_PUBLIC_APP_URL, card.code);
    const svg = await QRCode.toString(url, {
      type: 'svg',
      margin: 4,
      width: 512,
      color: { dark: '#000000', light: '#ffffff' },
    });
    return json<ScreenQr>(
      {
        code: card.code,
        url,
        svg,
        expiresAt: new Date(screenQrExpiresAt(card.screen_issued_at)).toISOString(),
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  }
  throw new Error('screen_qr_code_collision');
});
