import { fail, json, withRep } from '@/lib/api';
import { readBytesCapped } from '@/lib/http/body';
import { transcribeModel } from '@/lib/ai/models';
import { TranscriberUnavailableError, transcribeWav } from '@/lib/capture/transcribe';
import { isNoteWav, MAX_WAV_BYTES } from '@/lib/capture/voice';
import { checkRateLimit } from '@/lib/security/rate-limit';

/**
 * POST /api/capture/transcribe: a voice note (16 kHz mono WAV body, made in the
 * browser, 60 seconds at most) -> {text}. The audio goes to the model and is never
 * stored, logged or kept: nothing here touches the database or storage. 501 when no
 * transcription model is configured.
 */
export const POST = withRep(async (rep, request) => {
  const stt = transcribeModel();
  if (!stt) return fail('model_not_configured', 501);

  const limit = await checkRateLimit('transcribe', rep.userId);
  if (!limit.allowed) return fail('rate_limited', 429);

  const bytes = await readBytesCapped(request, MAX_WAV_BYTES);
  if (bytes === null) return fail('too_large', 413);
  if (!isNoteWav(bytes)) return fail('invalid_audio', 400);

  try {
    return json({ text: await transcribeWav({ model: stt.model, wav: bytes }) });
  } catch (error) {
    if (error instanceof TranscriberUnavailableError) return fail('ai_unavailable', 503);
    throw error;
  }
});
