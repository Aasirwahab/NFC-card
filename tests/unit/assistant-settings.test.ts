import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blockedTopicsSchema, suggestedAssistantQuestions } from '@/lib/chat/settings';
import { POST } from '@/app/api/assistant/settings/route';

const mocks = vi.hoisted(() => ({
  rep: { userId: 'owner' } as { userId: string } | null,
  allowed: true,
  update: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
}));
vi.mock('@/lib/db/server', () => ({ getRep: async () => mocks.rep }));
vi.mock('@/lib/db/service', () => ({
  serviceClient: () => ({
    from: () => ({
      update(value: unknown) {
        mocks.update(value);
        return this;
      },
      eq(...args: unknown[]) {
        mocks.eq(...args);
        return this;
      },
      select() {
        return this;
      },
      maybeSingle: mocks.single,
    }),
  }),
}));
vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: mocks.allowed }),
}));

function request(body: unknown) {
  return new Request('http://localhost/api/assistant/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rep = { userId: 'owner' };
  mocks.allowed = true;
  mocks.single.mockResolvedValue({ data: { user_id: 'owner' }, error: null });
});

describe('assistant topic settings', () => {
  it('accepts all presets and five short custom topics, trims and deduplicates', () => {
    expect(
      blockedTopicsSchema.parse([
        'pricing',
        'legal',
        'delivery',
        'competitors',
        ' a ',
        'b',
        'c',
        'd',
        'e',
        'a',
      ]),
    ).toEqual(['pricing', 'legal', 'delivery', 'competitors', 'a', 'b', 'c', 'd', 'e']);
  });
  it.each([['a', 'b', 'c', 'd', 'e', 'f'], ['x'.repeat(81)], [''], [12]])(
    'rejects invalid custom topics %j',
    (...topics) => {
      expect(blockedTopicsSchema.safeParse(topics).success).toBe(false);
    },
  );
  it('saves only to the authenticated owner, ignoring a supplied owner', async () => {
    const result = await POST(request({ blockedTopics: ['pricing'], user_id: 'other' }));
    expect(result.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ assistant_blocked_topics: ['pricing'] });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'owner');
  });
  it('refuses unauthenticated requests before writing', async () => {
    mocks.rep = null;
    expect((await POST(request({ blockedTopics: ['pricing'] }))).status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects invalid configuration before writing', async () => {
    expect((await POST(request({ blockedTopics: ['x'.repeat(81)] }))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('honours the rate limit', async () => {
    mocks.allowed = false;
    expect((await POST(request({ blockedTopics: [] }))).status).toBe(429);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('does not claim success for a missing profile', async () => {
    mocks.single.mockResolvedValue({ data: null, error: null });
    expect((await POST(request({ blockedTopics: [] }))).status).toBe(404);
  });
});

describe('assistant test suggestions', () => {
  it('uses own problems and empty knowledge topics', () => {
    const questions = suggestedAssistantQuestions(
      ['Manual booking'],
      [{ topic: 'pricing', content: 'From £20.' }],
    );
    expect(questions).toHaveLength(3);
    expect(questions[0]).toContain('Manual booking');
    expect(questions).not.toContain('What does it cost?');
  });
  it('provides three distinct questions without saved problems or knowledge gaps', () => {
    const questions = suggestedAssistantQuestions(
      [],
      ['pricing', 'services', 'timeline', 'proof', 'about', 'faq', 'niche'].map((topic) => ({
        topic,
        content: 'Added',
      })),
    );
    expect(questions).toHaveLength(3);
    expect(new Set(questions).size).toBe(3);
  });
});
