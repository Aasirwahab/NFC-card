import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeWav } from '@/lib/browser/wav';
import { POST } from '@/app/api/capture/transcribe/route';
import { MAX_WAV_BYTES, SAMPLE_RATE } from '@/lib/capture/voice';

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  rep: true,
  configured: true,
  allowed: true,
}));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: mocks.generateText,
}));
vi.mock('@/lib/ai/models', () => ({
  transcribeModel: () => (mocks.configured ? { id: 'google/test', model: 'test' } : null),
}));
vi.mock('@/lib/db/server', () => ({
  getRep: async () => (mocks.rep ? { userId: 'rep-1' } : null),
}));
vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: mocks.allowed }),
}));

const wav = encodeWav(new Float32Array(SAMPLE_RATE * 2));
const post = (body: Uint8Array | string) =>
  POST(
    new Request('http://localhost/api/capture/transcribe', {
      method: 'POST',
      headers: { 'content-type': 'audio/wav' },
      body: body as BodyInit,
    }),
  );

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rep = true;
  mocks.configured = true;
  mocks.allowed = true;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.generateText.mockResolvedValue({ text: '  Sarah Whitlock,\n stuck on funding ' });
});

describe('POST /api/capture/transcribe', () => {
  it('turns audio into words and sends the model only the audio and instructions', async () => {
    const response = await post(wav);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: 'Sarah Whitlock, stuck on funding' });
    const call = mocks.generateText.mock.calls[0]![0];
    expect(call.messages[0].content[1]).toMatchObject({ type: 'file', mediaType: 'audio/wav' });
  });

  it('refuses a rep who is not signed in', async () => {
    mocks.rep = false;
    expect((await post(wav)).status).toBe(401);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('says not configured when there is no transcription model', async () => {
    mocks.configured = false;
    const response = await post(wav);
    expect(response.status).toBe(501);
    expect(await response.json()).toEqual({ error: 'model_not_configured' });
  });

  it('refuses too much audio before reading it all', async () => {
    const response = await post(new Uint8Array(MAX_WAV_BYTES + 1));
    expect(response.status).toBe(413);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('refuses anything that is not a short 16 kHz mono WAV', async () => {
    expect((await post('not audio')).status).toBe(400);
    expect((await post(encodeWav(new Float32Array(10)))).status).toBe(400);
  });

  it('is rate limited', async () => {
    mocks.allowed = false;
    expect((await post(wav)).status).toBe(429);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('gives a plain failure when the provider fails, and logs neither audio nor words', async () => {
    mocks.generateText.mockRejectedValue(new Error('upstream said: Sarah Whitlock'));
    const response = await post(wav);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'ai_unavailable' });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('Sarah');
  });
});
