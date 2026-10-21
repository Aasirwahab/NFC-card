import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/chat/route';

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(),
  from: vi.fn(),
  used: 1 as number | null,
}));
vi.mock('ai', () => ({ generateText: mocks.generateText }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('@/lib/ai/models', () => ({ modelFor: () => ({ model: 'test' }) }));
vi.mock('@/lib/db/server', () => ({ getRep: async () => null }));
vi.mock('@/lib/db/service', () => ({
  serviceClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock('@/lib/env', () => ({ env: { CHAT_ENABLED: true } }));
vi.mock('@/lib/security/rate-limit', () => ({
  clientIp: () => '127.0.0.1',
  checkRateLimit: async () => ({ allowed: true }),
  peekRateLimit: async () => true,
}));

const sessionId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.used = 1;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.generateText.mockResolvedValue({
    text: 'I do not want to guess. Zaid can answer on a call.',
  });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'chat_unanswered') return { insert: mocks.insert };
    const data =
      table === 'cards'
        ? { id: 'card-id' }
        : { id: sessionId, user_id: userId, research: null, chat_response_count: 0 };
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      order() {
        return this;
      },
      maybeSingle: async () => ({ data }),
      limit: async () => ({ data: [] }),
    };
  });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'claim_chat_response') return { data: mocks.used, error: null };
    if (name === 'enrichment_snapshot')
      return {
        data: {
          session: {
            id: sessionId,
            user_id: userId,
            status: 'active',
            details_revision: 1,
            memorable_info: 'PRIVATE NOTE: Arsenal fan, two kids',
          },
          rep: { full_name: 'Zaid' },
          knowledge: [],
        },
        error: null,
      };
    return { data: null, error: null };
  });
});
afterEach(() => vi.restoreAllMocks());

const ask = (message = '  How long does setup take?  ') =>
  POST(
    new Request('https://example.com/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'ABCDEFGH', message }),
    }),
  );

describe('chat route unanswered questions', () => {
  it('records only the trimmed visitor question with the server-derived session and owner', async () => {
    const response = await ask();
    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith({
      session_id: sessionId,
      user_id: userId,
      question: 'How long does setup take?',
    });
    expect(JSON.stringify(mocks.insert.mock.calls)).not.toMatch(/PRIVATE|Arsenal|kids/);
  });

  it('also records the question when the guardrail replaces an unsupported answer', async () => {
    mocks.generateText.mockResolvedValue({ text: 'It costs £299 a month.' });
    const response = await ask('x'.repeat(500));
    expect((await response.json()).reply).toContain('Zaid can answer properly');
    expect(mocks.insert).toHaveBeenCalledWith({
      session_id: sessionId,
      user_id: userId,
      question: 'x'.repeat(500),
    });
  });

  it('does not record ordinary answers, small talk, capped chats or invalid requests', async () => {
    mocks.generateText.mockResolvedValue({ text: 'Zaid can tell you more on a call.' });
    expect((await ask()).status).toBe(200);
    expect((await ask('hi')).status).toBe(200);
    mocks.used = null;
    expect((await ask()).status).toBe(200);
    expect((await ask('x'.repeat(501))).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('keeps the visitor reply usable and logs no question or private note on an insert failure', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'sensitive database detail' } });
    expect((await ask()).status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(
      JSON.stringify({ event: 'chat_unanswered_failed', sessionId }),
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(
      /sensitive|PRIVATE|Arsenal|How long/,
    );
  });
});
