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

export const POST = withRep(async (rep, request) => {
  if (!requestSchema.safeParse(await readJson(request)).success)
    return fail('invalid_request', 400);
  const db = serviceClient();
  const limit = await checkRateLimit('screenQr', rep.userId);
  if (!limit.degraded && !limit.allowed) {
    return json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfter) } },
    );
  }
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('full_name, photo_url')
    .eq('id', rep.userId)
    .maybeSingle();
  if (profileError) return fail('temporarily_unavailable', 503);
  // The prospect page only needs a profile with a name (lib/db/landing.ts repFace); a photo is optional.
  if (!profile?.full_name?.trim()) return fail('profile_incomplete', 409);

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: card, error } = await db
      .rpc('issue_screen_card', { p_user_id: rep.userId, p_code: generateCode(randomBytes) })
      .maybeSingle();
    if (error?.code === '23505') continue;
    if (error) return fail('temporarily_unavailable', 503);
    if (!card)
      return json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '600' } });
    if (!card.screen_issued_at) throw new Error('screen_qr_issue_failed');

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
