import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCode } from '@/lib/db/landing';

const state = vi.hoisted(() => ({
  firstViewed: null as string | null,
  hasSession: true,
  selected: [] as string[],
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
              }
            : table === 'sessions'
              ? state.hasSession
                ? {
                    id: 'contact',
                    user_id: 'owner',
                    event_id: 'event',
                    details_completed_at: null,
                    first_viewed_at: state.firstViewed,
                    prospect_picked_problems: ['Slow quotes'],
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
  state.selected = [];
});
afterEach(() => vi.useRealTimers());

describe('portfolio holding resolution', () => {
  it('keeps portfolio basics and the recent prospect choices without reading delivery details', async () => {
    const result = await resolveCode('ABCDEFGH', null);
    expect(result.audience).toBe('owner');
    if (result.audience !== 'owner') throw new Error('Expected portfolio');
    expect(result.rep.fullName).toBe('Sam Smith');
    expect(result.holding).toEqual({
      ready: true,
      problems: ['Slow quotes'],
      picked: ['Slow quotes'],
      expiresAt: Date.parse('2026-11-14T11:00:00Z'),
    });
    expect(state.selected.join(',')).not.toMatch(/submitted_email|submitted_phone|memorable_info/);
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
});
