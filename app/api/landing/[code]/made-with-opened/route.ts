import { recordLandingEvent } from '@/lib/landing/record-event';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  return recordLandingEvent(code, 'made_with_opened');
}
