import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/landing/[code]/status/route';
const mocks = vi.hoisted(() => ({
  details: null as string | null,
  firstViewed: '2026-11-13T10:00:00Z',
  status: 'pending',
  held: false,
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/security/rate-limit', () => ({
  clientIp: () => 'ip',
  checkRateLimit: async () => ({ allowed: true }),
  peekRateLimit: async () => true,
}));
vi.mock('@/lib/db/service', () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: async () => ({
        data:
          table === 'cards'
            ? { id: 'card' }
            : table === 'profiles'
              ? { review_before_live: mocks.held }
              : {
                  enrichment_status: mocks.status,
                  details_completed_at: mocks.details,
                  first_viewed_at: mocks.firstViewed,
                  rep_pitch: null,
                  details_revision: 1,
                  pitch_approved_revision: null,
                  user_id: 'owner',
                },
      }),
    }),
  }),
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
  mocks.details = null;
  mocks.firstViewed = '2026-11-13T10:00:00Z';
  mocks.status = 'pending';
  mocks.held = false;
});
const status = async () =>
  (
    await GET(new Request('https://example.com'), { params: Promise.resolve({ code: 'ABCDEFGH' }) })
  ).json();
describe('public tap-first status', () => {
  it('returns holding while the contact has no saved details and tap is recent', async () => {
    expect(await status()).toEqual({ status: 'holding' });
  });
  it('returns portfolio after the first tap ages out', async () => {
    mocks.firstViewed = '2026-11-12T12:00:00Z';
    expect(await status()).toEqual({ status: 'portfolio' });
  });
  it('returns working after details are saved and completed when generated', async () => {
    mocks.details = '2026-11-13T11:00:00Z';
    mocks.status = 'queued';
    expect(await status()).toEqual({ status: 'working' });
    mocks.status = 'completed';
    expect(await status()).toEqual({ status: 'completed' });
  });
  it('keeps approval hold for saved contacts', async () => {
    mocks.details = '2026-11-13T11:00:00Z';
    mocks.status = 'completed';
    mocks.held = true;
    expect(await status()).toEqual({ status: 'held' });
  });
});
