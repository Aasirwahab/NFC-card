import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { checkBookingLink } = await import('@/lib/booking/check');

describe('checkBookingLink', () => {
  const link = 'https://cal.com/someone/15min';

  it('reports a calendar that does not exist', async () => {
    expect(await checkBookingLink(link, async () => ({ status: 404 }))).toBe('missing');
    expect(await checkBookingLink(link, async () => ({ status: 410 }))).toBe('missing');
  });

  it('accepts a working calendar', async () => {
    expect(await checkBookingLink(link, async () => ({ status: 200 }))).toBe('ok');
  });

  it('never blocks on a timeout or network error', async () => {
    expect(
      await checkBookingLink(link, async () => {
        throw new Error('timeout');
      }),
    ).toBe('unknown');
    expect(await checkBookingLink(link, async () => ({ status: 503 }))).toBe('unknown');
  });
});
