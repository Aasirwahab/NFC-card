import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/cron/jobs/route';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  remove: vi.fn(),
  lt: vi.fn(),
  claim: vi.fn(),
  reap: vi.fn(),
  kick: vi.fn(),
}));
vi.mock('@/lib/env', () => ({ env: { CRON_SECRET: 'test-cron', RETENTION_MONTHS: 6 } }));
vi.mock('@/lib/db/service', () => ({
  serviceClient: () => ({
    rpc: mocks.rpc,
    from: mocks.from,
  }),
}));
vi.mock('@/lib/security/once', () => ({ claimOnce: mocks.claim }));
vi.mock('@/lib/jobs/store', () => ({ supabaseJobStore: { reap: mocks.reap } }));
vi.mock('@/lib/jobs/kick', () => ({ kickWorkers: mocks.kick }));
vi.mock('@/lib/alert', () => ({ alert: vi.fn() }));

const request = () =>
  new Request('https://example.com/api/cron/jobs', {
    headers: { authorization: 'Bearer test-cron' },
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-14T12:34:56Z'));
  mocks.rpc.mockResolvedValue({ data: 0, error: null });
  mocks.from.mockReturnValue({ delete: mocks.remove });
  mocks.remove.mockReturnValue({ lt: mocks.lt });
  mocks.lt.mockResolvedValue({ error: null });
  mocks.claim.mockResolvedValue(true);
  mocks.reap.mockResolvedValue([]);
  mocks.kick.mockResolvedValue({ staleQueued: 0, claimable: 0, running: 0 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('daily pilot request retention', () => {
  it('deletes requests older than 12 calendar months since last activity, independently of session retention', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.claim).toHaveBeenCalledWith('retention-purge:2026-11-14', 26 * 3600);
    expect(mocks.rpc).toHaveBeenCalledWith('purge_expired_sessions', { p_months: 6 });
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith('early_access_requests');
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.lt).toHaveBeenCalledExactlyOnceWith('updated_at', '2025-11-14T12:34:56.000Z');
  });

  it('clamps a leap day cutoff to the last day of February', async () => {
    vi.setSystemTime(new Date('2028-02-29T12:34:56Z'));
    await GET(request());
    expect(mocks.lt).toHaveBeenCalledWith('updated_at', '2027-02-28T12:34:56.000Z');
  });

  it('does not delete outside the daily purge', async () => {
    mocks.claim.mockResolvedValue(false);
    await GET(request());
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith('purge_expired_sessions', expect.anything());
    expect(mocks.kick).toHaveBeenCalledOnce();
  });

  it('rejects unauthorised calls before touching the database', async () => {
    const response = await GET(new Request('https://example.com/api/cron/jobs'));
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('still purges requests if the session purge returns an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: 0,
      error: name === 'purge_expired_sessions' ? { message: 'unavailable' } : null,
    }));
    await GET(request());
    expect(mocks.lt).toHaveBeenCalledOnce();
  });

  it('logs a request purge failure and continues the worker sweep', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.lt.mockResolvedValue({ error: { message: 'unavailable' } });
    expect((await GET(request())).status).toBe(200);
    expect(error).toHaveBeenCalledWith(
      JSON.stringify({ event: 'early_access_purge_failed', error: 'unavailable' }),
    );
    expect(mocks.kick).toHaveBeenCalledOnce();
  });
});
