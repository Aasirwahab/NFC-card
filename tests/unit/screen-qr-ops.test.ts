import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { listReps } from '@/lib/ops/data';
import OpsCard from '@/app/(ops)/ops/cards/[code]/page';

const state = vi.hoisted(() => ({ screenIssued: true }));
vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://example.com' } }));
vi.mock('@/lib/auth/staff', () => ({ requireStaff: async () => ({ email: 'staff@example.com' }) }));
vi.mock('@/app/(ops)/ops/actions', () => ({
  reassignCardAction: async () => {},
  resetCardAction: async () => {},
  voidCardAction: async () => {},
}));
vi.mock('@/lib/db/service', () => ({
  serviceClient: () => ({
    auth: {
      admin: {
        listUsers: async () => ({
          data: { users: [{ id: 'rep', email: 'rep@example.com', created_at: '2026-11-14' }] },
        }),
        getUserById: async () => ({ data: { user: { email: 'rep@example.com' } } }),
      },
    },
    rpc: (name: string) => {
      if (name !== 'ops_card_stock') throw new Error('unexpected_rpc');
      return {
        throwOnError: async () => ({
          data: [
            {
              user_id: 'rep',
              in_stock: 40,
              handed_out: 20,
              lost: 3,
              needs_writing: 10,
              needs_verifying: 5,
              screen_issued: 2000,
            },
          ],
        }),
      };
    },
    from: (table: string) => {
      const data =
        table === 'cards'
          ? [
              {
                id: 'card',
                code: 'ABCDEFGH',
                user_id: 'rep',
                status: 'available',
                screen_issued_at: state.screenIssued ? '2026-11-14T12:00:00Z' : null,
                written_at: null,
                verified_at: null,
              },
            ]
          : table === 'profiles'
            ? [{ id: 'rep', full_name: 'Sam', low_stock_at: 5 }]
            : [];
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        async maybeSingle() {
          return { data: data[0] ?? null };
        },
        async throwOnError() {
          return { data };
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data }).then(resolve);
        },
      };
    },
  }),
}));
beforeEach(() => {
  state.screenIssued = true;
});

it('uses database totals for stock and reorder decisions without fetching card rows', async () => {
  const reps = await listReps();
  expect(reps[0]?.stock).toEqual({
    inStock: 40,
    handedOut: 20,
    lost: 3,
    needsWriting: 10,
    needsVerifying: 5,
    screenIssued: 2000,
  });
  expect(reps[0]?.lowStock).toBe(false);
});

it.each([true, false])(
  'hides reassignment only for screen cards (screen=%s)',
  async (screenIssued) => {
    state.screenIssued = screenIssued;
    const page = await OpsCard({
      params: Promise.resolve({ code: 'ABCDEFGH' }),
      searchParams: Promise.resolve({}),
    });
    expect(renderToStaticMarkup(page).includes('Move to another rep')).toBe(!screenIssued);
  },
);
