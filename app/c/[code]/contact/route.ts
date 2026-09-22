import { headers } from 'next/headers';
import { contactForCode } from '@/lib/db/landing';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import { buildVCard, vCardFilename } from '@/lib/domain/vcard';
import { checkRateLimit, clientIp, peekRateLimit } from '@/lib/security/rate-limit';

/**
 * GET /c/[code]/contact — "Save the rep's contact" as a vCard (Phase 5).
 *
 * The rep's details only; nothing about the prospect. Rate-limited like the page
 * it hangs off, sharing its miss budget, and a miss is a plain 404 that says
 * nothing about whether the code exists (§22.2).
 *
 * Not a tap: saving the contact never touches first_viewed_at (§10.4).
 */
export const dynamic = 'force-dynamic';

const notFound = () => new Response('Not found', { status: 404 });

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code: raw } = await context.params;
  const code = normaliseCode(raw);
  const ip = clientIp(await headers());

  if (!isValidCode(code)) {
    await checkRateLimit('landingMiss', ip);
    return notFound();
  }

  const [limit, missesLeft] = await Promise.all([
    checkRateLimit('landing', ip),
    peekRateLimit('landingMiss', ip),
  ]);
  if (!limit.allowed || !missesLeft) {
    return new Response('Try again in a minute', {
      status: 429,
      headers: { 'retry-after': String(limit.allowed ? 60 : limit.retryAfter) },
    });
  }

  const contact = await contactForCode(code);
  if (!contact) {
    await checkRateLimit('landingMiss', ip);
    return notFound();
  }

  const filename = vCardFilename(contact.fullName);

  return new Response(buildVCard(contact), {
    headers: {
      'content-type': 'text/vcard; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      // A private link handed to one person (§22.6): never cached, never indexed.
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
}
