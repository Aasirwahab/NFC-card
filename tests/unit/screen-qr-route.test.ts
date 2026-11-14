import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/cards/screen/route';
import { GET } from '@/app/api/cards/screen/[code]/route';
import { isValidCode } from '@/lib/domain/codes';
import { POST as register } from '@/app/api/sessions/register/route';
import { POST as tapRegister } from '@/app/api/sessions/tap-register/route';

const state = vi.hoisted(() => ({
  rep: true,
  allowed: true,
  degraded: false,
  owner: 'rep-1',
  issued: '2026-11-14T12:00:00Z',
  cardStatus: 'available',
  session: null as { id: string; first_viewed_at: string | null } | null,
  inserted: [] as Record<string, unknown>[],
  collision: 0,
  dbError: false,
  limits: [] as string[][],
  recentCount: 0,
}));
vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://insignar.app/' } }));
vi.mock('@/lib/db/server', () => ({
  getRep: async () => (state.rep ? { userId: 'rep-1' } : null),
}));
vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: async (...args: string[]) => {
    state.limits.push(args);
    return { allowed: state.allowed, degraded: state.degraded, retryAfter: 60 };
  },
}));
vi.mock('@/lib/db/service', () => ({
  serviceClient: () => ({
    from: (table: string) => {
      const filters = new Map<string, unknown>();
      let insert: Record<string, unknown> | undefined;
      return {
        select() {
          return this;
        },
        eq(key: string, value: unknown) {
          filters.set(key, value);
          return this;
        },
        async gte() {
          if (state.dbError) return { count: null, error: new Error('unavailable') };
          return { count: state.recentCount, error: null };
        },
        insert(value: Record<string, unknown>) {
          insert = value;
          state.inserted.push(value);
          return this;
        },
        async single() {
          if (state.collision-- > 0) return { data: null, error: { code: '23505' } };
          return { data: insert, error: null };
        },
        async maybeSingle() {
          if (state.dbError) return { data: null, error: new Error('unavailable') };
          return {
            data:
              filters.get('user_id') !== state.owner
                ? null
                : table === 'cards'
                  ? { id: 'card-1', status: state.cardStatus, screen_issued_at: state.issued }
                  : state.session,
            error: null,
          };
        },
      };
    },
  }),
}));

const post = (body: unknown = {}) =>
  POST(
    new Request('https://insignar.app/api/cards/screen', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
const get = (code = 'ABCDEFGH') =>
  GET(new Request('https://insignar.app/api/cards/screen/' + code), {
    params: Promise.resolve({ code }),
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
  Object.assign(state, {
    rep: true,
    allowed: true,
    degraded: false,
    owner: 'rep-1',
    issued: '2026-11-14T12:00:00Z',
    cardStatus: 'available',
    session: null,
    inserted: [],
    collision: 0,
    dbError: false,
    limits: [],
    recentCount: 0,
  });
});
afterEach(() => vi.useRealTimers());

describe('rep screen QR API', () => {
  it('issues a fresh code owned by the authenticated rep and encodes the normal QR URL', async () => {
    const response = await post();
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(isValidCode(result.code)).toBe(true);
    expect(result.url).toBe(`https://insignar.app/c/${result.code}?src=qr`);
    expect(result.svg).toContain('<svg');
    expect(result.expiresAt).toBe('2026-11-14T12:30:00.000Z');
    expect(state.inserted).toEqual([
      { code: result.code, user_id: 'rep-1', screen_issued_at: '2026-11-14T12:00:00.000Z' },
    ]);
    expect(state.limits[0]).toEqual(['screenQr', 'rep-1']);
  });
  it('rejects unauthenticated issuance and polling', async () => {
    state.rep = false;
    expect((await post()).status).toBe(401);
    expect((await get()).status).toBe(401);
    expect(state.inserted).toHaveLength(0);
  });
  it('rejects attempts to choose another owner', async () => {
    expect((await post({ user_id: 'someone-else' })).status).toBe(400);
    expect(state.inserted).toHaveLength(0);
  });
  it('refuses issuance when the per-rep budget is exhausted', async () => {
    state.allowed = false;
    expect((await post()).status).toBe(429);
    expect(state.inserted).toHaveLength(0);
  });
  it('without Redis, keeps the hourly cap from the database instead of blocking the rep', async () => {
    state.degraded = true;
    state.recentCount = 30;
    expect((await post()).status).toBe(429);
    state.dbError = true;
    expect((await post()).status).toBe(503);
    expect(state.inserted).toHaveLength(0);
    state.dbError = false;
    state.recentCount = 3;
    expect((await post()).status).toBe(200);
    expect(state.inserted).toHaveLength(1);
  });
  it('retries a unique-code collision', async () => {
    state.collision = 1;
    expect((await post()).status).toBe(200);
    expect(state.inserted).toHaveLength(2);
    expect(state.inserted[0]!.code).not.toBe(state.inserted[1]!.code);
  });
  it('never returns another rep’s scan status', async () => {
    state.owner = 'someone-else';
    expect((await get()).status).toBe(404);
    expect((await get('invalid')).status).toBe(400);
  });
  it('treats binding as the scan even if the view-count write has not finished at expiry', async () => {
    expect(await (await get()).json()).toEqual({ status: 'waiting' });
    state.session = { id: 'contact-1', first_viewed_at: null };
    vi.setSystemTime(new Date('2026-11-14T13:00:00Z'));
    const response = await get();
    expect(await response.json()).toEqual({ status: 'scanned', sessionId: 'contact-1' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('does not let either rep registration endpoint impersonate the prospect scan path', async () => {
    const body = {
      session_id: crypto.randomUUID(),
      event_id: crypto.randomUUID(),
      code: 'ABCDEFGH',
      registered_by: 'prospect_tap',
    };
    const request = () =>
      new Request('https://insignar.app/api/sessions/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    expect((await register(request())).status).toBe(400);
    expect((await tapRegister(request())).status).toBe(400);
  });
  it('expires unused codes at thirty minutes and never reoffers a removed contact', async () => {
    vi.setSystemTime(new Date('2026-11-14T12:30:00Z'));
    expect(await (await get()).json()).toEqual({ status: 'expired' });
    vi.setSystemTime(new Date('2026-11-14T12:01:00Z'));
    state.cardStatus = 'assigned';
    expect(await (await get()).json()).toEqual({ status: 'expired' });
  });
});
