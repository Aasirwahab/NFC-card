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
  blockedTopics: [] as string[],
  avoid: null as string | null,
  limit: vi.fn(),
  scopes: [] as [string, string, unknown][],
  orders: [] as [string, string][],
  historyError: false,
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
  checkRateLimit: mocks.limit,
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
  mocks.blockedTopics = [];
  mocks.avoid = null;
  mocks.scopes = [];
  mocks.orders = [];
  mocks.historyError = false;
  mocks.limit.mockResolvedValue({ allowed: true });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.generateText.mockResolvedValue({
    output: { outcome: 'unknown', reply: 'I can’t confirm setup timing; Zaid can.', action: null },
  });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'chat_unanswered') return { insert: mocks.insert };
    const data =
      table === 'profiles'
        ? {
            full_name: 'Zaid',
            assistant_blocked_topics: mocks.blockedTopics,
            pitch_avoid: mocks.avoid,
            pitch_tone: 'formal',
          }
        : table === 'business_profiles'
          ? null
          : table === 'knowledge_base'
            ? [{ topic: 'faq', content: 'We help with setup.' }]
            : table === 'cards'
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
      eq(key: string, value: unknown) {
        mocks.scopes.push([table, key, value]);
        return this;
      },
      then(resolve: (result: unknown) => unknown) {
        return Promise.resolve({ data, error: null }).then(resolve);
      },
      order(column: string) {
        mocks.orders.push([table, column]);
        return this;
      },
      maybeSingle: async () => ({ data }),
      limit: async () => ({
        data: mocks.history,
        error: mocks.historyError ? { message: 'failed' } : null,
      }),
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
          rep: {
            full_name: 'Zaid',
            booking_url: mocks.bookingUrl,
            pitch_tone: 'formal',
            pitch_avoid: mocks.avoid,
          },
          knowledge: [{ topic: 'faq', content: 'We help with setup.' }],
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
      output: {
        outcome: 'answered',
        reply: 'Zaid can tell you more.',
        action: null,
        topics: ['faq'],
      },
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
        output: { outcome, reply: 'A short reply.', action: null, topics: ['faq'] },
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

const testAsk = (message = 'What do you offer?', extra: Record<string, unknown> = {}) =>
  POST(
    new Request('https://example.com/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true, message, ...extra }),
    }),
  );

describe('assistant studio shared path', () => {
  it('passes tone and retries an avoided phrase once, returning only the safe answer/source', async () => {
    mocks.avoid = 'game changer';
    mocks.generateText
      .mockResolvedValueOnce({
        output: {
          outcome: 'answered',
          reply: 'A game changer for setup.',
          action: null,
          topics: ['faq'],
        },
      })
      .mockResolvedValueOnce({
        output: {
          outcome: 'answered',
          reply: 'We help with setup.',
          action: null,
          topics: ['faq', 'forged'],
        },
      });
    const response = await ask('What do you offer?');
    expect(await response.json()).toMatchObject({
      reply: 'We help with setup.',
      sourceLine: "From Zaid's FAQ notes",
      remaining: 4,
    });
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(mocks.generateText.mock.calls[0]![0].instructions).toContain('Writing tone: formal');
    expect(mocks.generateText.mock.calls[1]![0].instructions).toContain(
      'last reply contained an avoided phrase',
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      'record_assistant_turn',
      expect.objectContaining({ p_source_topics: ['faq'] }),
    );
  });
  it('hands off after a second avoided reply and logs the gap once', async () => {
    mocks.avoid = 'game changer';
    mocks.generateText.mockResolvedValue({
      output: {
        outcome: 'answered',
        reply: 'A GAME—CHANGER for setup.',
        action: null,
        topics: ['faq'],
      },
    });
    const result = await (await ask()).json();
    expect(result.reply).toContain('Zaid can help');
    expect(result.sourceLine).toBeNull();
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(mocks.insert).toHaveBeenCalledOnce();
  });
  it('refunds and hands off if the retry fails', async () => {
    mocks.avoid = 'game changer';
    mocks.generateText
      .mockResolvedValueOnce({
        output: { outcome: 'answered', reply: 'A game changer.', action: null, topics: ['faq'] },
      })
      .mockRejectedValueOnce(new Error('timeout'));
    expect(await (await ask()).json()).toMatchObject({
      outcome: 'unknown',
      remaining: 5,
      sourceLine: null,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('release_chat_response', { p_session_id: sessionId });
  });
  it('blocks mixed pricing questions before either model or cap and marks the handoff', async () => {
    mocks.blockedTopics = ['pricing'];
    expect(await (await ask('Call me with a price')).json()).toMatchObject({
      reply: 'Zaid will answer that one personally.',
      handedOff: true,
      sourceLine: null,
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'claim_chat_response')).toBe(false);
    expect(mocks.insert).toHaveBeenCalledWith({
      session_id: sessionId,
      user_id: userId,
      question: 'Call me with a price',
      handed_off: true,
    });
  });
  it('uses only the classifier for an indirect blocked topic', async () => {
    mocks.blockedTopics = ['pricing'];
    mocks.generateText.mockResolvedValue({ output: { blocked: true } });
    expect(await (await ask('How much will I owe?')).json()).toMatchObject({
      reply: 'Zaid will answer that one personally.',
    });
    expect(mocks.generateText).toHaveBeenCalledOnce();
    expect(mocks.generateText.mock.calls[0]![0].instructions).toContain('Classify only.');
    expect(JSON.stringify(mocks.generateText.mock.calls)).not.toContain('We help with setup.');
  });
  it.each([5, 6])('does not add blocked handoffs after %s answers', async (count) => {
    mocks.responseCount = count;
    mocks.blockedTopics = ['pricing'];
    for (const question of ['What is the price?', 'Can I get a discount?']) {
      expect(await (await ask(question)).json()).toMatchObject({
        handedOff: true,
        remaining: 0,
        sourceLine: null,
      });
    }
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
  it('fails closed on classifier errors without reaching the answer model', async () => {
    mocks.blockedTopics = ['legal'];
    mocks.generateText.mockRejectedValue(new Error('provider failed'));
    expect(await (await ask('Who signs it?')).json()).toMatchObject({ handedOff: true });
    expect(mocks.generateText).toHaveBeenCalledOnce();
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'claim_chat_response')).toBe(false);
  });
  it('refuses test requests without authentication and before any data read', async () => {
    expect((await testAsk()).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
  it('rejects a code on the test path and never accepts a client identity', async () => {
    mocks.owner = true;
    expect((await testAsk('Hi', { code: 'ABCDEFGH' })).status).toBe(400);
    await testAsk('What do you offer?', { userId: 'other-rep' });
    expect(mocks.scopes).toEqual([
      ['profiles', 'id', userId],
      ['business_profiles', 'user_id', userId],
      ['knowledge_base', 'user_id', userId],
    ]);
  });
  it('uses its per-rep rate limit before reading or generating', async () => {
    mocks.owner = true;
    mocks.limit.mockResolvedValue({ allowed: false });
    expect((await testAsk()).status).toBe(429);
    expect(mocks.limit).toHaveBeenCalledExactlyOnceWith('assistantTest', userId);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
  it.each(['answered', 'partial', 'unknown'] as const)(
    'test %s uses the same answer/source checks, with no writes, history, claims or cap',
    async (outcome) => {
      mocks.owner = true;
      mocks.used = null;
      mocks.responseCount = 5;
      mocks.generateText.mockResolvedValue({
        output: { outcome, reply: 'We help with setup.', action: null, topics: ['faq', 'forged'] },
      });
      expect(await (await testAsk()).json()).toMatchObject({
        reply: 'We help with setup.',
        outcome,
        remaining: 5,
        sourceLine: outcome === 'unknown' ? null : "From Zaid's FAQ notes",
      });
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
        'profiles',
        'business_profiles',
        'knowledge_base',
      ]);
    },
  );
  it.each(['Hi', 'Can we book a call?', 'What does it cost?'])(
    'test fixed response writes nothing: %s',
    async (message) => {
      mocks.owner = true;
      mocks.blockedTopics = ['pricing'];
      expect((await testAsk(message)).status).toBe(200);
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
      if (message.includes('cost')) expect(mocks.generateText).not.toHaveBeenCalled();
    },
  );
  it('test guardrail replacements also write no unanswered rows', async () => {
    mocks.owner = true;
    mocks.generateText.mockResolvedValue({
      output: { outcome: 'answered', reply: 'It costs £999.', action: null, topics: ['faq'] },
    });
    expect(await (await testAsk()).json()).toMatchObject({ outcome: 'unknown', sourceLine: null });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('allows only existing source topics on the prospect response', async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        outcome: 'answered',
        reply: 'We help with setup.',
        action: null,
        topics: ['forged'],
      },
    });
    expect(await (await ask()).json()).toMatchObject({ outcome: 'unknown', sourceLine: null });
    expect(mocks.insert).toHaveBeenCalledOnce();
  });
});

it('classifies contextual follow-ups before answering, including redacted history', async () => {
  mocks.blockedTopics = ['pricing'];
  mocks.history = [
    { role: 'assistant', content: 'Zaid will answer that one personally.' },
    { role: 'user', content: 'What does the service cost? me@example.test' },
  ];
  mocks.generateText.mockResolvedValue({ output: { blocked: true } });
  expect(await (await ask('And for a larger team?')).json()).toMatchObject({ handedOff: true });
  expect(mocks.generateText).toHaveBeenCalledOnce();
  const data = JSON.parse(mocks.generateText.mock.calls[0]![0].messages[0].content);
  expect(data.history[0]).toEqual({
    role: 'user',
    content: 'What does the service cost? [email redacted]',
  });
  expect(mocks.rpc.mock.calls.some(([name]) => name === 'claim_chat_response')).toBe(false);
});

it('never reintroduces a handed-off question into the answer model history', async () => {
  mocks.history = [
    { role: 'assistant', content: 'Zaid will answer that one personally.' },
    { role: 'user', content: 'What does it cost?' },
    { role: 'assistant', content: 'Hi!' },
    { role: 'user', content: 'Hello' },
  ];
  mocks.generateText.mockResolvedValue({
    output: { outcome: 'answered', reply: 'We help with setup.', action: null, topics: ['faq'] },
  });
  await ask('What services do you offer?');
  expect(mocks.generateText.mock.calls[0]![0].messages).toEqual([
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi!' },
    { role: 'user', content: 'What services do you offer?' },
  ]);
});

it('tests with the same knowledge ordering as the live bounded snapshot', async () => {
  mocks.owner = true;
  await testAsk();
  expect(mocks.orders).toEqual([
    ['knowledge_base', 'topic'],
    ['knowledge_base', 'created_at'],
  ]);
});

it('fails closed when conversation history cannot be loaded for blocked-topic classification', async () => {
  mocks.blockedTopics = ['pricing'];
  mocks.historyError = true;
  expect((await ask('And for a larger team?')).status).toBe(502);
  expect(mocks.generateText).not.toHaveBeenCalled();
  expect(mocks.rpc.mock.calls.some(([name]) => name === 'claim_chat_response')).toBe(false);
});
