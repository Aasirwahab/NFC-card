import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getContactActivity, listFollowups } from '@/lib/db/rep';

const mocks = vi.hoisted(() => ({
  queries: [] as { table: string; filters: [string, unknown][]; columns: string }[],
  result: vi.fn(),
}));
vi.mock('@/lib/db/service', () => ({
  serviceClient: () => ({
    from: (table: string) => {
      const query = { table, filters: [] as [string, unknown][], columns: '' };
      mocks.queries.push(query);
      const chain = {
        select: (columns: string) => {
          query.columns = columns;
          return chain;
        },
        eq: (key: string, value: unknown) => {
          query.filters.push([key, value]);
          return chain;
        },
        not: () => chain,
        gte: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => chain,
        throwOnError: () => mocks.result(table),
      };
      return chain;
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queries.length = 0;
});

describe('server ownership of contact activity', () => {
  it('returns no transcript for another rep or a missing contact, from an owner-scoped query', async () => {
    mocks.result.mockResolvedValue({ data: null });
    expect(await getContactActivity('rep-a', 'contact-b')).toBeNull();
    expect(mocks.queries).toHaveLength(1);
    expect(mocks.queries[0]!.table).toBe('sessions');
    expect(mocks.queries[0]!.filters).toEqual([
      ['user_id', 'rep-a'],
      ['id', 'contact-b'],
    ]);
    expect(mocks.queries[0]!.columns).toContain('chat_messages');
    expect(mocks.queries[0]!.columns).toContain('last_viewed_at');
  });

  it('returns the owner’s recorded events and transcript', async () => {
    const activity = {
      view_count: 3,
      first_viewed_at: '2026-11-06T10:00:00Z',
      last_viewed_at: '2026-11-13T14:02:00Z',
      session_events: [],
      chat_messages: [
        { id: 1, role: 'user', content: 'Price?', created_at: '2026-11-06T10:00:00Z' },
      ],
      chat_unanswered: [],
      bookings: [],
    };
    mocks.result.mockResolvedValue({ data: activity });
    expect(await getContactActivity('rep-a', 'contact-a')).toEqual({
      ...activity,
      readAt: expect.any(Number),
    });
    expect(mocks.queries[0]!.filters).toContainEqual(['user_id', 'rep-a']);
  });

  it('surfaces read errors rather than claiming the prospect did nothing', async () => {
    mocks.result.mockRejectedValue(new Error('unavailable'));
    await expect(getContactActivity('rep-a', 'contact-a')).rejects.toThrow('unavailable');
  });
});

describe('follow-up list wiring', () => {
  it('scopes contacts to the rep, ranks signals first, and supplies a draft and page path for clicked rows', async () => {
    const base = {
      id: 'none',
      status: 'active',
      details_completed_at: '2026-11-10T12:00:00Z',
      registered_at: '2026-11-10T12:00:00Z',
      first_viewed_at: null,
      last_viewed_at: null,
      view_count: 0,
      followup_sent_at: null,
      followup_outcome: null,
      problems: [],
      prospect_name: 'Tom',
      prospect_company: null,
      linkedin_url: null,
      prospect_email: null,
      prospect_submitted_email: null,
      prospect_submitted_phone: null,
      event_sequence_number: 1,
      colour_tag: 'Blue',
      cards: { code: 'abc' },
      session_events: [],
      chat_messages: [],
      bookings: [],
    };
    mocks.result.mockImplementation(async (table: string) => ({
      data:
        table === 'sessions'
          ? [
              base,
              {
                ...base,
                id: 'requested',
                prospect_submitted_email: 'tom@example.com',
                registered_at: '2026-11-13T12:00:00Z',
                chat_messages: [{ content: 'What is the price?' }],
              },
              { ...base, id: 'mobile', prospect_submitted_phone: '+447700900123' },
              {
                ...base,
                id: 'saved',
                prospect_email: 'new@example.com',
                prospect_submitted_email: 'old@example.com',
              },
              {
                ...base,
                id: 'emailed',
                prospect_submitted_email: 'tom@example.com',
                prospect_email: 'saved@example.com',
                session_events: [{ type: 'prospect_note_emailed' }, { type: 'page_emailed' }],
              },
              {
                ...base,
                id: 'opened',
                first_viewed_at: '2026-11-11T12:00:00Z',
                last_viewed_at: '2026-11-13T10:00:00Z',
                view_count: 3,
              },
              { ...base, id: 'booking', session_events: [{ type: 'booking_opened' }] },
              {
                ...base,
                id: 'question',
                chat_messages: [
                  { content: 'Does it work offline?' },
                  { content: 'What is the price?' },
                ],
              },
            ]
          : table === 'profiles'
            ? { full_name: 'Zaid' }
            : { company_name: null },
    }));
    const result = await listFollowups('rep-a', Date.parse('2026-11-13T12:00:00Z'));
    expect(result.actionable.map((r) => r.sessionId)).toEqual([
      'requested',
      'mobile',
      'saved',
      'question',
      'booking',
      'opened',
      'none',
      'emailed',
    ]);
    expect(result.actionable.find((r) => r.sessionId === 'question')!.draft).toContain(
      'You asked: “Does it work offline?”',
    );
    expect(result.actionable.find((r) => r.sessionId === 'question')!.signal.label).toBe(
      'Asked about pricing',
    );
    expect(result.actionable[0]).toMatchObject({
      state: 'review',
      preferContact: true,
      prospectEmail: 'tom@example.com',
      signal: { label: 'Asked you to send their note', rank: 6 },
    });
    expect(result.actionable.find((r) => r.sessionId === 'opened')!.signal.label).toBe(
      'Opened 3 times, last today',
    );
    expect(result.actionable[0]!.draft).toBe(
      "Hi Tom,\n\nHere is your note from our conversation.\n\nZaid\n\nReply stop and I won't write again.",
    );
    expect(result.actionable.find((r) => r.sessionId === 'mobile')).toMatchObject({
      preferContact: true,
      prospectEmail: null,
      prospectPhone: '+447700900123',
    });
    expect(result.actionable.find((r) => r.sessionId === 'saved')!.prospectEmail).toBe(
      'old@example.com',
    );
    expect(result.actionable.find((r) => r.sessionId === 'emailed')).toMatchObject({
      state: 'due-no-tap',
      prospectEmail: 'saved@example.com',
      prospectPhone: null,
      preferContact: false,
      signal: { label: 'We emailed them their note', rank: 0 },
    });
    expect(mocks.queries[0]!.columns).toContain('last_viewed_at');
    expect(mocks.queries[0]!.columns).toContain('prospect_submitted_email');
    expect(mocks.queries[0]!.columns).toContain('prospect_submitted_phone');
    expect(result.actionable.every((r) => r.draft && r.pagePath === '/c/abc')).toBe(true);
    expect(mocks.queries.find((q) => q.table === 'sessions')!.filters).toContainEqual([
      'user_id',
      'rep-a',
    ]);
    expect(mocks.queries.find((q) => q.table === 'sessions')!.columns).not.toMatch(
      /memorable_info|custom_problems/,
    );
  });
});
