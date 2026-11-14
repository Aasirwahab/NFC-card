import { beforeEach, describe, expect, it, vi } from 'vitest';
import { productionNotifyContactDeps } from '@/lib/notify/contact-deps';

const h = vi.hoisted(() => ({
  session: null as Record<string, unknown> | null,
  error: null as { code: string } | null,
  userError: null as Error | null,
  getUser: vi.fn(),
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
      maybeSingle: async () =>
        table === 'sessions'
          ? { data: h.session, error: h.error }
          : { data: { full_name: 'Sam Smith' }, error: null },
    }),
    auth: {
      admin: {
        getUserById: (...args: unknown[]) => {
          h.getUser(...args);
          return Promise.resolve({
            data: { user: { email: 'rep@example.com' } },
            error: h.userError,
          });
        },
      },
    },
  }),
}));
vi.mock('@/lib/email/mailer', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://example.com' } }));

beforeEach(() => {
  vi.clearAllMocks();
  h.error = null;
  h.userError = null;
  h.session = {
    status: 'active',
    user_id: 'rep-id',
    prospect_name: null,
    prospect_submitted_email: 'prospect@example.com',
    prospect_submitted_phone: null,
    prospect_form_answers: [{ label: 'Name', value: 'Bella Jones' }],
    prospect_consent_at: '2026-11-14T12:00:00Z',
  };
});
describe('production contact alert data', () => {
  it('addresses the sign-in user and reads the submitted name, full contact and saved answers', async () => {
    const data = await productionNotifyContactDeps().load('session');
    expect(h.getUser).toHaveBeenCalledExactlyOnceWith('rep-id');
    expect(data).toEqual({
      status: 'active',
      to: 'rep@example.com',
      repFirstName: 'Sam',
      prospectName: 'Bella Jones',
      email: 'prospect@example.com',
      phone: null,
      answers: [{ label: 'Name', value: 'Bella Jones' }],
      consentAt: '2026-11-14T12:00:00Z',
    });
  });
  it('uses the rep-known name if none was submitted and tolerates absent answer snapshots', async () => {
    h.session = { ...h.session, prospect_name: 'Tom Hargreaves', prospect_form_answers: null };
    expect(await productionNotifyContactDeps().load('session')).toMatchObject({
      prospectName: 'Tom Hargreaves',
      answers: [],
    });
  });
  it('skips deleted sessions', async () => {
    h.session = null;
    expect(await productionNotifyContactDeps().load('session')).toBeNull();
    expect(h.getUser).not.toHaveBeenCalled();
  });
  it('retries session and rep lookup failures rather than marking the alert complete', async () => {
    h.error = { code: '08006' };
    await expect(productionNotifyContactDeps().load('session')).rejects.toThrow(
      /session load failed/,
    );
    h.error = null;
    h.userError = new Error('offline');
    await expect(productionNotifyContactDeps().load('session')).rejects.toThrow(/rep load failed/);
  });
});
