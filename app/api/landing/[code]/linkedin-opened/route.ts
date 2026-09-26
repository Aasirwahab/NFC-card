import { recordLandingEvent } from '@/lib/landing/record-event';

/**
 * POST /api/landing/[code]/linkedin-opened — "Connect on LinkedIn" was tapped
 * (2026-09-25 review). A prospect who connects gives the rep a lasting, allowed
 * follow-up channel; the count says whether the button earns its place.
 */
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  return recordLandingEvent(code, 'linkedin_opened');
}
