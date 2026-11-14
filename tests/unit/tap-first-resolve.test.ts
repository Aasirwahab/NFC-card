import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCode } from '@/lib/db/landing';

const state = vi.hoisted(() => ({
  firstViewed: null as string | null,
  hasSession: true,
  completed: false,
  selected: [] as string[],
  screenIssued: null as string | null,
}));
vi.mock('@/lib/capture/prospect-problems', () => ({
  getProspectProblems: async () => ['Slow quotes'],
}));
vi.mock('@/lib/db/service', () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select(columns: string) {
        state.selected.push(columns);
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: async () => ({
        data:
          table === 'cards'
            ? {
                id: 'card',
                user_id: 'owner',
                status: 'available',
                written_at: null,
                verified_at: null,
                screen_issued_at: state.screenIssued,
              }
            : table === 'sessions'
              ? state.hasSession
                ? {
                    id: 'contact',
                    user_id: 'owner',
                    event_id: 'event',
                    details_completed_at: state.completed ? '2026-11-13T12:00:00Z' : null,
                    first_viewed_at: state.firstViewed,
                    prospect_picked_problems: ['Slow quotes'],
                    prospect_answer_token_hash: 'private-hash',
                  }
                : null
              : table === 'profiles'
                ? { full_name: 'Sam Smith', review_before_live: false }
                : null,
      }),
    }),
  }),
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
  state.firstViewed = '2026-11-13T11:00:00Z';
  state.hasSession = true;
  state.completed = false;
  state.selected = [];
  state.screenIssued = null;
});
afterEach(() => vi.useRealTimers());

describe('portfolio holding resolution', () => {
  it('keeps portfolio basics but never serializes another browser’s selected topics', async () => {
    const result = await resolveCode('ABCDEFGH', null);
    expect(result.audience).toBe('owner');
    if (result.audience !== 'owner') throw new Error('Expected portfolio');
    expect(result.rep.fullName).toBe('Sam Smith');
    expect(result.holding).toEqual({
      ready: true,
      problems: ['Slow quotes'],
      picked: [],
      readOnly: true,
      expiresAt: Date.parse('2026-11-14T11:00:00Z'),
    });
    expect(state.selected.join(',')).not.toMatch(/submitted_email|submitted_phone|memorable_info/);
  });
  it('never includes the answer token hash in a completed public page', async () => {
    state.completed = true;
    const result = await resolveCode('ABCDEFGH', null);
    expect(result.audience).toBe('prospect');
    expect(JSON.stringify(result)).not.toContain('private-hash');
    expect(JSON.stringify(result)).not.toContain('prospect_answer_token_hash');
  });
  it('drops the promise after exactly 24 hours', async () => {
    state.firstViewed = '2026-11-12T12:00:00Z';
    const result = await resolveCode('ABCDEFGH', null);
    expect(result.audience === 'owner' && result.holding).toBeNull();
  });
  it('waits for the first tap to register before offering writable inputs', async () => {
    for (const hasSession of [false, true]) {
      state.hasSession = hasSession;
      state.firstViewed = null;
      const result = await resolveCode('ABCDEFGH', null);
      expect(result.audience === 'owner' && result.holding?.ready).toBe(false);
    }
  });
  it('keeps the signed-in owner on the rep view', async () => {
    expect((await resolveCode('ABCDEFGH', 'owner')).audience).toBe('rep');
  });
  it('shows the neutral rep profile for a stale unused screen QR, without a holding promise', async () => {
    state.hasSession = false;
    state.screenIssued = '2026-11-13T11:30:00Z';
    const result = await resolveCode('ABCDEFGH', null);
    expect(result.audience === 'owner' && result.rep.fullName).toBe('Sam Smith');
    expect(result.audience === 'owner' && result.holding).toBeNull();
  });
  it('uses the same holding and note resolution for a scanned screen code after the issuance deadline', async () => {
    state.screenIssued = '2026-11-13T10:00:00Z';
    const holding = await resolveCode('ABCDEFGH', null);
    expect(holding.audience === 'owner' && holding.holding?.ready).toBe(true);
    state.completed = true;
    expect((await resolveCode('ABCDEFGH', null)).audience).toBe('prospect');
  });
});
