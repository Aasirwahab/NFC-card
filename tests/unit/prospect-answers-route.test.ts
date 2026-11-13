import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/landing/[code]/answers/route';

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  ownerCookie: false,
  staff: false,
  details: null as string | null,
  firstViewed: '2026-11-13T10:00:00Z',
  choices: ['Problem A', 'Problem B'],
  update: vi.fn(),
  filters: vi.fn(),
  rate: vi.fn(),
  race: false,
  missing: false,
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => (mocks.ownerCookie ? { value: 'owner' } : undefined) }),
}));
vi.mock('@/lib/db/server', () => ({
  getRep: async () => (mocks.userId ? { userId: mocks.userId } : null),
}));
vi.mock('@/lib/auth/staff', () => ({
  getStaff: async () => (mocks.staff ? { userId: mocks.userId } : null),
}));
vi.mock('@/lib/capture/prospect-problems', () => ({
  getProspectProblems: async () => mocks.choices,
}));
vi.mock('@/lib/security/rate-limit', () => ({
  clientIp: () => 'ip',
  checkRateLimit: (...args: unknown[]) => mocks.rate(...args),
  peekRateLimit: async () => true,
}));
vi.mock('@/lib/db/service', () => ({
  serviceClient: () => ({
    from: (table: string) => {
      let updating = false;
      return {
        select() {
          return this;
        },
        update(value: unknown) {
          updating = true;
          mocks.update(value);
          return this;
        },
        eq(...args: unknown[]) {
          mocks.filters(...args);
          return this;
        },
        is(...args: unknown[]) {
          mocks.filters(...args);
          return this;
        },
        maybeSingle: async () => ({
          data: updating
            ? mocks.race
              ? null
              : { id: 'session' }
            : table === 'cards'
              ? mocks.missing
                ? null
                : { id: 'card', user_id: 'owner' }
              : {
                  id: 'session',
                  user_id: 'owner',
                  event_id: 'event',
                  details_completed_at: mocks.details,
                  first_viewed_at: mocks.firstViewed,
                },
          error: null,
        }),
      };
    },
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
  mocks.userId = null;
  mocks.ownerCookie = false;
  mocks.staff = false;
  mocks.details = null;
  mocks.firstViewed = '2026-11-13T10:00:00Z';
  mocks.race = false;
  mocks.missing = false;
  mocks.rate.mockResolvedValue({ allowed: true });
});
const submit = (body: unknown) =>
  POST(
    new Request('https://example.com/api/landing/ABCDEFGH/answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ code: 'ABCDEFGH' }) },
  );

describe('prospect answer writes', () => {
  it('saves valid chips alone with an atomic unsaved and active guard', async () => {
    expect((await submit({ problems: ['Problem A'] })).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      prospect_picked_problems: ['Problem A'],
    });
    expect(mocks.filters).toHaveBeenCalledWith('details_completed_at', null);
    expect(mocks.filters).toHaveBeenCalledWith('status', 'active');
    expect(mocks.rate).toHaveBeenCalledWith('prospectAnswers', 'ip:ip');
    expect(mocks.rate).toHaveBeenCalledWith('prospectAnswers', 'card:ABCDEFGH');
  });
  it('stores only a normalised contact and server consent timestamp', async () => {
    expect((await submit({ contact: ' A@EXAMPLE.COM ', consent: true })).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      prospect_submitted_email: 'a@example.com',
      prospect_submitted_phone: null,
      prospect_consent_at: '2026-11-13T12:00:00.000Z',
    });
  });
  it('rejects a problem outside this contact event list', async () => {
    expect((await submit({ problems: ['Injected topic'] })).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('refuses the signed-in owner, signed-out owner device and staff', async () => {
    mocks.userId = 'owner';
    expect((await submit({ problems: [] })).status).toBe(403);
    mocks.userId = null;
    mocks.ownerCookie = true;
    expect((await submit({ problems: [] })).status).toBe(403);
    mocks.ownerCookie = false;
    mocks.userId = 'staff';
    mocks.staff = true;
    expect((await submit({ problems: [] })).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('allows a different signed-in rep who is not staff', async () => {
    mocks.userId = 'another-rep';
    expect((await submit({ problems: [] })).status).toBe(200);
  });
  it('refuses saved, expired, and concurrently saved contacts with 409', async () => {
    mocks.details = '2026-11-13T11:00:00Z';
    expect((await submit({ problems: [] })).status).toBe(409);
    mocks.details = null;
    mocks.firstViewed = '2026-11-12T12:00:00Z';
    expect((await submit({ problems: [] })).status).toBe(409);
    mocks.firstViewed = '2026-11-13T10:00:00Z';
    mocks.race = true;
    expect((await submit({ problems: [] })).status).toBe(409);
  });
  it('rejects invalid input before writing and rate limits per card', async () => {
    expect((await submit({ contact: 'a@example.com', consent: false })).status).toBe(400);
    mocks.rate.mockImplementation(async (_name, key) => ({ allowed: key !== 'card:ABCDEFGH' }));
    expect((await submit({ problems: [] })).status).toBe(429);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
