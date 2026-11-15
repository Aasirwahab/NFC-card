import { beforeEach, expect, it, vi } from 'vitest';
import { listProspectRequests } from '@/lib/db/requests';
import { GET } from '@/app/api/requests/route';
const h = vi.hoisted(() => ({
  rep: { userId: 'rep-a' } as { userId: string } | null,
  queries: [] as { table: string; filters: [string, unknown][] }[],
  sessions: [] as unknown[],
}));
vi.mock('@/lib/db/server', () => ({ getRep: async () => h.rep }));
vi.mock('@/lib/db/service', () => ({
  serviceClient: () => ({
    from: (table: string) => {
      const query = { table, filters: [] as [string, unknown][] };
      h.queries.push(query);
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => {
          query.filters.push([key, value]);
          return chain;
        },
        maybeSingle: () => chain,
        throwOnError: async () => ({
          data:
            table === 'sessions'
              ? h.sessions
              : table === 'profiles'
                ? { full_name: 'Sam Smith' }
                : { company_name: 'Acme' },
        }),
      };
      return chain;
    },
  }),
}));
const session = {
  id: 's1',
  status: 'active',
  details_completed_at: null,
  registered_at: '2026-11-14T10:00:00Z',
  first_viewed_at: '2026-11-14T10:00:00Z',
  followup_sent_at: null,
  followup_outcome: null,
  problems: [],
  prospect_name: 'Tom Smith',
  prospect_submitted_email: null,
  prospect_submitted_phone: null,
  cards: { code: 'ABCD2345' },
  events: { name: 'Expo' },
  bookings: [],
  prospect_requests: [
    {
      id: 'r1',
      kind: 'details',
      channel: 'email',
      contact_value: 'tom@example.com',
      best_time: 'today',
      status: 'open',
      created_at: '2026-11-14T10:00:00Z',
      done_at: null,
    },
  ],
};
beforeEach(() => {
  h.rep = { userId: 'rep-a' };
  h.queries = [];
  h.sessions = [];
});
it('scopes live recipient reads to the signed-in owner and optional contact', async () => {
  h.sessions = [session];
  const result = await listProspectRequests('rep-a', 's1');
  expect(h.queries[0]!.filters).toEqual([
    ['user_id', 'rep-a'],
    ['status', 'active'],
    ['prospect_requests.status', 'open'],
    ['id', 's1'],
  ]);
  expect(result[0]).toMatchObject({
    id: 'r1',
    sessionId: 's1',
    contact: 'tom@example.com',
    prospectName: 'Tom Smith',
    repFullName: 'Sam Smith',
    eventName: 'Expo',
    pagePath: '/c/ABCD2345',
  });
  expect(
    h.queries
      .filter((q) => q.table !== 'sessions')
      .every((q) => q.filters.some(([, value]) => value === 'rep-a')),
  ).toBe(true);
});
it('does not offer a response after a reply, drop or booking', async () => {
  for (const patch of [
    { followup_outcome: 'replied' },
    { followup_outcome: 'dropped' },
    { bookings: [{ session_id: 's1', status: 'confirmed' }] },
  ]) {
    h.sessions = [{ ...session, ...patch }];
    expect(await listProspectRequests('rep-a')).toEqual([]);
  }
});
it('requires authentication, validates contact filter before querying, and disables caching', async () => {
  h.rep = null;
  expect((await GET(new Request('http://localhost/api/requests'))).status).toBe(401);
  expect(h.queries).toHaveLength(0);
  h.rep = { userId: 'rep-a' };
  expect((await GET(new Request('http://localhost/api/requests?contact=hostile'))).status).toBe(
    404,
  );
  expect(h.queries).toHaveLength(0);
  const response = await GET(
    new Request('http://localhost/api/requests?contact=12345678-1234-4234-8234-123456789012'),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(h.queries[0]!.filters).toContainEqual(['user_id', 'rep-a']);
});
