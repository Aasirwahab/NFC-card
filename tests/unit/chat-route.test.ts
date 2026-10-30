import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { POST } from '@/app/api/chat/route';

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(),
  from: vi.fn(),
  used: 1 as number | null,
  owner: false,
  history: [] as { role: string; content: string }[],
  bookingUrl: null as string | null,
  responseCount: 0,
}));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: mocks.generateText,
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('@/lib/ai/models', () => ({ modelFor: () => ({ model: 'test' }) }));
vi.mock('@/lib/db/server', () => ({ getRep: async () => (mocks.owner ? { userId } : null) }));
vi.mock('@/lib/email/mailer', () => ({ emailConfigured: () => false }));
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
  mocks.owner = false;
  mocks.history = [];
  mocks.bookingUrl = null;
  mocks.responseCount = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.generateText.mockResolvedValue({
    output: { outcome: 'unknown', reply: 'I can’t confirm setup timing; Zaid can.', action: null },
  });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'chat_unanswered') return { insert: mocks.insert };
    const data =
      table === 'cards'
        ? { id: 'card-id' }
        : {
            id: sessionId,
            user_id: userId,
            research: { facts: ['SECRET RESEARCH FACT'], domainSource: 'provided' },
            chat_response_count: mocks.responseCount,
          };
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
      limit: async () => ({ data: mocks.history }),
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
          rep: { full_name: 'Zaid', booking_url: mocks.bookingUrl },
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
    mocks.generateText.mockResolvedValue({
      output: { outcome: 'answered', reply: 'It costs £299 a month.', action: null },
    });
    const response = await ask('x'.repeat(500));
    expect((await response.json()).reply).toContain('Zaid can help');
    expect(mocks.insert).toHaveBeenCalledWith({
      session_id: sessionId,
      user_id: userId,
      question: 'x'.repeat(500),
    });
  });

  it('does not record ordinary answers, small talk, capped chats or invalid requests', async () => {
    mocks.generateText.mockResolvedValue({
      output: { outcome: 'answered', reply: 'Zaid can tell you more.', action: null },
    });
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

describe('Release 1 chat route', () => {
  it.each(['unknown', 'partial'])('logs %s by type, independent of wording', async (outcome) => {
    mocks.generateText.mockResolvedValue({
      output: { outcome, reply: 'Ask about Salesforce directly.', action: null },
    });
    expect((await ask()).status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledOnce();
  });
  it.each(['answered', 'privacy', 'injection', 'offtopic', 'action'])(
    'does not log %s as a knowledge gap',
    async (outcome) => {
      mocks.generateText.mockResolvedValue({
        output: { outcome, reply: 'A short reply.', action: null },
      });
      expect((await ask()).status).toBe(200);
      expect(mocks.insert).not.toHaveBeenCalled();
    },
  );
  it.each([
    undefined,
    null,
    {},
    { outcome: 'wrong', reply: 'x', action: null },
    { outcome: 'unknown', reply: '', action: null },
  ])('falls back without a knowledge gap on malformed output: %j', async (output) => {
    mocks.generateText.mockResolvedValue({ output });
    const response = await ask();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      outcome: 'unknown',
      remaining: 5,
      reply: expect.stringContaining('Zaid can help'),
    });
    expect(console.error).toHaveBeenCalledWith(
      JSON.stringify({ event: 'chat_structured_output_failed', sessionId }),
    );
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('release_chat_response', { p_session_id: sessionId });
  });
  it('catches a throwing structured-output getter', async () => {
    mocks.generateText.mockResolvedValue({
      get output() {
        throw new Error('private model payload');
      },
    });
    expect((await ask()).status).toBe(200);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      'private model payload',
    );
  });
  it('refunds timeouts and returns a usable unknown reply', async () => {
    mocks.generateText.mockRejectedValue(new Error('timeout with private prompt'));
    const response = await ask();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: 'unknown', remaining: 5 });
    expect(mocks.rpc).toHaveBeenCalledWith('release_chat_response', { p_session_id: sessionId });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private prompt');
  });
  it('routes booking and contacts before claiming a model response', async () => {
    mocks.bookingUrl = 'https://cal.com/zaid/intro';
    expect(await (await ask('Can we book a call?')).json()).toMatchObject({
      actionId: 'book',
      remaining: 5,
    });
    mocks.bookingUrl = null;
    expect(await (await ask('Can we book a call?')).json()).toMatchObject({
      actionId: 'save-contact',
    });
    expect(await (await ask('Call me on 07700 900123')).json()).toMatchObject({
      actionId: 'save-contact',
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'claim_chat_response')).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('preserves the cap for fixed intents', async () => {
    mocks.responseCount = 5;
    expect(await (await ask('Can we book a call?')).json()).toMatchObject({ remaining: 0 });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
  it('redacts both history roles before the model, while recording the original question', async () => {
    mocks.history = [
      { role: 'assistant', content: 'Your email is visitor@example.test' },
      { role: 'user', content: 'My phone is 07700 900123' },
    ];
    await ask('Do you work with Salesforce?');
    const options = mocks.generateText.mock.calls[0]![0];
    expect(JSON.stringify(options.messages)).not.toMatch(/07700|visitor@example/);
    expect(JSON.stringify(options.messages)).toContain('[phone redacted]');
    expect(options.instructions).not.toMatch(/SECRET RESEARCH FACT|PRIVATE NOTE/);
    expect(mocks.history[1]?.content).toContain('07700');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'record_chat_turn',
      expect.objectContaining({ p_question: 'Do you work with Salesforce?' }),
    );
  });
  it('uses the existing owner-preview protection before model or router', async () => {
    mocks.owner = true;
    expect((await ask('Can we book a call?')).status).toBe(403);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});

it('handles actual SDK schema failure without returning an error or logging a knowledge gap', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'not JSON' }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 0, text: 0, reasoning: undefined },
      },
      warnings: [],
    }),
  });
  mocks.generateText.mockImplementationOnce((options) =>
    actual.generateText({ ...options, model }),
  );
  const response = await ask();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ outcome: 'unknown', remaining: 5 });
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalledWith(
    JSON.stringify({ event: 'chat_structured_output_failed', sessionId }),
  );
});
