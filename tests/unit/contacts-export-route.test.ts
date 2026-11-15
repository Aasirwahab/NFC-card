import { beforeEach, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/contacts/export/route';

const mocks = vi.hoisted(() => ({
  getRep: vi.fn(),
  limit: vi.fn(),
  from: vi.fn(),
  event: null as { id: string; name: string } | null,
  pages: [] as unknown[][],
  error: null as { message: string } | null,
  calls: [] as [string, string, ...unknown[]][],
}));
vi.mock('@/lib/db/server', () => ({ getRep: mocks.getRep }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('@/lib/db/service', () => ({ serviceClient: () => ({ from: mocks.from }) }));
const eventId = '0b1c9a2e-5d6f-4a7b-8c9d-0e1f2a3b4c5d';
const get = (query = '') => GET(new Request(`http://localhost/api/contacts/export${query}`));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.calls.length = 0;
  mocks.event = { id: eventId, name: 'Café "Expo" / 2026' };
  mocks.pages = [[]];
  mocks.error = null;
  mocks.getRep.mockResolvedValue({ userId: 'rep-id' });
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.from.mockImplementation((table: string) => {
    const chain = {
      select: (...args: unknown[]) => {
        mocks.calls.push([table, 'select', ...args]);
        return chain;
      },
      eq: (...args: unknown[]) => {
        mocks.calls.push([table, 'eq', ...args]);
        return chain;
      },
      order: (...args: unknown[]) => {
        mocks.calls.push([table, 'order', ...args]);
        return chain;
      },
      range: (...args: unknown[]) => {
        mocks.calls.push([table, 'range', ...args]);
        return { returns: async () => ({ data: mocks.pages.shift() ?? [], error: mocks.error }) };
      },
      maybeSingle: async () => ({ data: mocks.event, error: mocks.error }),
    };
    return chain;
  });
});

it('returns 401 before querying or spending budget when signed out', async () => {
  mocks.getRep.mockResolvedValue(null);
  expect((await get()).status).toBe(401);
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.limit).not.toHaveBeenCalled();
});

it('limits exports by rep id', async () => {
  mocks.limit.mockResolvedValue({ allowed: false });
  expect((await get()).status).toBe(429);
  expect(mocks.limit).toHaveBeenCalledWith('contactsExport', 'rep-id');
  expect(mocks.from).not.toHaveBeenCalled();
});

it('returns 404 for another rep’s event before reading contacts', async () => {
  mocks.event = null;
  expect((await get(`?event=${eventId}`)).status).toBe(404);
  expect(mocks.calls).toContainEqual(['events', 'eq', 'user_id', 'rep-id']);
  expect(mocks.from).not.toHaveBeenCalledWith('sessions');
});

it.each(['', 'invalid'])('rejects an invalid event id %j', async (id) => {
  expect((await get(`?event=${id}`)).status).toBe(404);
  expect(mocks.from).not.toHaveBeenCalled();
});

it('sets download headers and queries only the rep’s active contacts newest first', async () => {
  const response = await get();
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('content-disposition')).toMatch(
    /^attachment; filename="insignar-contacts-\d{4}-\d{2}-\d{2}\.csv"$/,
  );
  expect(new Uint8Array(await response.arrayBuffer()).slice(0, 3)).toEqual(
    new Uint8Array([239, 187, 191]),
  );
  expect(mocks.calls).toContainEqual(['sessions', 'eq', 'user_id', 'rep-id']);
  expect(mocks.calls).toContainEqual(['sessions', 'eq', 'status', 'active']);
  expect(mocks.calls).toContainEqual(['sessions', 'order', 'registered_at', { ascending: false }]);
  const selected = mocks.calls.find(
    ([table, method]) => table === 'sessions' && method === 'select',
  )?.[2];
  expect(selected).not.toMatch(/\*|memorable_info|research|pitch|chat/);
});

it('filters an owned event and includes a safe event slug in the filename', async () => {
  const response = await get(`?event=${eventId}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-disposition')).toMatch(
    /insignar-contacts-cafe-expo-2026-\d{4}-\d{2}-\d{2}\.csv/,
  );
  expect(mocks.calls).toContainEqual(['sessions', 'eq', 'event_id', eventId]);
});

it('fails closed on query errors instead of exporting an empty or partial file', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.error = { message: 'query failed' };
  expect((await get()).status).toBe(500);
  expect((await get(`?event=${eventId}`)).status).toBe(500);
  log.mockRestore();
});

it('exports every page and scopes each page to the rep', async () => {
  const row = {
    id: 'session',
    events: { name: 'Expo' },
    cards: { code: 'ABCD1234' },
    registered_at: '2026-11-14T10:00:00Z',
    prospect_name: 'Contact',
    prospect_company: null,
    prospect_email: null,
    prospect_submitted_email: null,
    prospect_phone: null,
    prospect_submitted_phone: null,
    linkedin_url: null,
    prospect_website: null,
    problems: [],
    prospect_picked_problems: null,
    first_viewed_at: null,
    view_count: 0,
    bookings: [],
    followup_outcome: null,
    followup_sent_at: null,
    prospect_form_answers: [],
  };
  mocks.pages = [
    Array.from({ length: 500 }, () => row),
    [{ ...row, prospect_name: 'Final contact' }],
  ];
  const response = await get();
  const csv = await response.text();
  expect(response.status).toBe(200);
  expect(csv.split('\r\n')).toHaveLength(503);
  expect(csv).toContain('Final contact');
  expect(mocks.calls).toContainEqual(['sessions', 'range', 0, 499]);
  expect(mocks.calls).toContainEqual(['sessions', 'range', 500, 999]);
  expect(
    mocks.calls.filter(
      (call) => call[0] === 'sessions' && call[1] === 'eq' && call[2] === 'user_id',
    ),
  ).toEqual([
    ['sessions', 'eq', 'user_id', 'rep-id'],
    ['sessions', 'eq', 'user_id', 'rep-id'],
  ]);
});
