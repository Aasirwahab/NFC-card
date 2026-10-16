import { serviceClient } from '@/lib/db/service';
import { pilotRow } from '@/lib/insignar/pilot-request';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/email/mailer';
import { checkRateLimit, clientIp } from '@/lib/security/rate-limit';

/**
 * POST /api/insignar/pilot: the landing page's pilot request.
 *
 * Saved to the existing early_access_requests table (one row per email, so a
 * second request updates the first). Same rate limit and honeypot idea as the
 * home page's early-access action. Staff (STAFF_EMAILS) are emailed best-effort
 * when a mail provider is configured; the saved row is the source of truth.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  // A bot that fills the invisible field is told thanks and nothing is saved.
  if (typeof body.website === 'string' && body.website.trim()) return Response.json({ ok: true });

  const row = pilotRow(body);
  if (!row) return Response.json({ ok: false, error: 'invalid_input' }, { status: 400 });

  const limit = await checkRateLimit('earlyAccess', clientIp(req.headers));
  if (!limit.allowed) return Response.json({ ok: false, error: 'rate_limited' }, { status: 429 });

  const { error } = await serviceClient()
    .from('early_access_requests')
    .upsert(row, { onConflict: 'email' });
  if (error) {
    console.error(JSON.stringify({ event: 'pilot_request_save_failed', error: error.message }));
    return Response.json({ ok: false, error: 'save_failed' }, { status: 500 });
  }

  await notifyStaff(row).catch((e) =>
    console.error(JSON.stringify({ event: 'pilot_notify_failed', error: String(e) })),
  );
  return Response.json({ ok: true });
}

async function notifyStaff(row: NonNullable<ReturnType<typeof pilotRow>>) {
  const text = `New pilot request\n\n${JSON.stringify(row, null, 2)}`;
  const day = new Date().toISOString().slice(0, 10);
  await Promise.all(
    env.STAFF_EMAILS.map((to) =>
      sendEmail({
        to,
        subject: 'INSIGNAR pilot request',
        text,
        html: `<pre>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
        idempotencyKey: `pilot-${row.email}-${day}-${to}`,
      }),
    ),
  );
}
