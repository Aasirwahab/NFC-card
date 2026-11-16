import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as markSent } from '@/app/api/sessions/[id]/followup/sent/route';
import { POST as setOutcome } from '@/app/api/sessions/[id]/followup/outcome/route';

const mocks = vi.hoisted(() => ({
  getRep: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  filters: [] as [string, unknown][],
}));
vi.mock('@/lib/db/server', () => ({ getRep: mocks.getRep }));
vi.mock('@/lib/db/service', () => ({
  serviceClient: () => ({
    rpc: mocks.rpc,
    from: () => {
      const chain = {
        update: (values: unknown) => {
          mocks.update(values);
          return chain;
        },
        eq: (column: string, value: unknown) => {
          mocks.filters.push([column, value]);
          return chain;
        },
        select: () => chain,
        maybeSingle: mocks.maybeSingle,
      };
      return chain;
    },
  }),
}));

const id = '0b1c9a2e-5d6f-4a7b-8c9d-0e1f2a3b4c5d';
const context = (value: string) => ({ params: Promise.resolve({ id: value }) });
const post = (body?: unknown) =>
  new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.filters.length = 0;
  mocks.getRep.mockResolvedValue({ userId: 'rep-id' });
});

describe('POST followup/sent', () => {
  it('marks the rep’s own lead, scoped to the signed-in rep', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const response = await markSent(post(), context(id));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('mark_followup_sent', {
      p_session_id: id,
      p_user_id: 'rep-id',
    });
  });

  it('is 404 for another rep’s lead, and for an id that is not a uuid', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await markSent(post(), context(id))).status).toBe(404);
    mocks.rpc.mockClear();
    expect((await markSent(post(), context('nope'))).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('needs a signed-in rep', async () => {
    mocks.getRep.mockResolvedValue(null);
    expect((await markSent(post(), context(id))).status).toBe(401);
  });
});

describe('POST followup/outcome', () => {
  it('reopen clears the outcome', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id }, error: null });
    const response = await setOutcome(post({ outcome: 'reopen' }), context(id));
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ followup_outcome: null });
  });

  it.each(['replied', 'dropped'])(
    'records %s for the rep’s own live lead only',
    async (outcome) => {
      mocks.maybeSingle.mockResolvedValue({ data: { id }, error: null });
      const response = await setOutcome(post({ outcome }), context(id));
      expect(response.status).toBe(200);
      expect(mocks.update).toHaveBeenCalledWith({ followup_outcome: outcome });
      expect(mocks.filters).toEqual([
        ['id', id],
        ['user_id', 'rep-id'],
        ['status', 'active'],
      ]);
    },
  );

  it('is 404 when no row of the rep’s matches', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await setOutcome(post({ outcome: 'dropped' }), context(id))).status).toBe(404);
    expect((await setOutcome(post({ outcome: 'dropped' }), context('nope'))).status).toBe(404);
  });

  it('rejects any other outcome before touching the database', async () => {
    for (const body of [{ outcome: 'sent' }, { outcome: null }, {}, undefined]) {
      expect((await setOutcome(post(body), context(id))).status).toBe(400);
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
