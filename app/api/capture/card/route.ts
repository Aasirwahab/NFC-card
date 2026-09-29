import { fail, json, withRep } from '@/lib/api';
import { visionModel } from '@/lib/ai/models';
import { readCard } from '@/lib/capture/card';
import { isJpeg } from '@/lib/profile/photo';
import { checkRateLimit } from '@/lib/security/rate-limit';

const MAX_BYTES = 1_500_000;

/**
 * POST /api/capture/card: a photographed business card (JPEG body, resized in the
 * browser) -> proposed form fields. The image goes to the vision model and is never
 * stored, logged or kept: nothing here touches the database. 501 when no vision
 * model is configured.
 */
export const POST = withRep(async (rep, request) => {
  const vision = visionModel();
  if (!vision) return fail('scan_not_configured', 501);

  const limit = await checkRateLimit('lookup', rep.userId);
  if (!limit.allowed) return fail('rate_limited', 429);

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) return fail('empty', 400);
  if (bytes.length > MAX_BYTES) return fail('too_large', 413);
  if (!isJpeg(bytes)) return fail('not_jpeg', 400);

  return json(await readCard({ model: vision.model, jpeg: bytes }));
});
