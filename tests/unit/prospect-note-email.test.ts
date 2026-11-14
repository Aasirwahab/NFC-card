import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendProspectNoteEmail } from '@/lib/email/prospect-note';
import type { ProspectResolved } from '@/lib/db/landing';

const mocks = vi.hoisted(() => ({
  configured: true,
  email: 'prospect@example.com' as string | null,
  consent: '2026-11-13',
  sent: false,
  held: false,
  send: vi.fn(),
  status: 'active',
  savedEmail: null as string | null,
  missing: false,
  afterClaim: () => {},
  resolve: vi.fn(),
}));
vi.mock('@/lib/email/mailer', () => ({
  emailConfigured: () => mocks.configured,
  sendEmail: (...args: unknown[]) => mocks.send(...args),
}));
vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://example.com' } }));
vi.mock('@/lib/db/landing', () => ({
  resolveCode: (...args: unknown[]) => mocks.resolve(...args),
  shownPitch: () => 'Your public note',
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
          table === 'sessions'
            ? mocks.missing
              ? null
              : {
                  card_id: 'card',
                  user_id: 'owner',
                  status: mocks.status,
                  prospect_email: mocks.savedEmail,
                  prospect_submitted_email: mocks.email,
                  prospect_consent_at: mocks.consent,
                }
            : table === 'cards'
              ? { code: 'ABCDEFGH' }
              : { contact_email: 'rep@example.com' },
      }),
      insert: async (rows: { type: string } | { type: string }[]) => {
        const events = Array.isArray(rows) ? rows : [rows];
        if (events.some((row) => row.type === 'prospect_note_emailed')) {
          if (mocks.sent) return { error: { code: '23505' } };
          mocks.sent = true;
          mocks.afterClaim();
        }
        return { error: null };
      },
      delete() {
        mocks.sent = false;
        return this;
      },
      then(resolve: (value: unknown) => void) {
        resolve({ count: mocks.sent ? 1 : 0, error: null });
      },
    }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks, {
    configured: true,
    email: 'prospect@example.com',
    consent: '2026-11-13',
    sent: false,
    held: false,
    status: 'active',
    savedEmail: null,
    missing: false,
    afterClaim: () => {},
  });
  mocks.send.mockResolvedValue('sent');
  mocks.resolve.mockImplementation(
    async () =>
      ({
        audience: 'prospect',
        held: mocks.held,
        session: { id: 'contact', prospect_name: 'Tom' },
        rep: { fullName: 'Sam Smith', title: 'Owner', bookingUrl: null },
        business: null,
        view: { state: 'crafting' },
      }) as unknown as ProspectResolved,
  );
});

describe('automatic prospect note delivery', () => {
  it('sends the existing page-link template once, using a stable contact key', async () => {
    await sendProspectNoteEmail('contact');
    await sendProspectNoteEmail('contact');
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'prospect@example.com',
        subject: 'Your note from Sam',
        replyTo: 'rep@example.com',
        idempotencyKey: 'prospect_note:contact',
        text: expect.stringContaining('https://example.com/c/ABCDEFGH'),
      }),
    );
  });
  it('claims before sending so concurrent workers send only once', async () => {
    mocks.send.mockImplementation(async () => {
      expect(mocks.sent).toBe(true);
      return 'sent';
    });
    await Promise.all([sendProspectNoteEmail('contact'), sendProspectNoteEmail('contact')]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it.each(['removed', 'inactive', 'email removed', 'email changed', 'rep email changed', 'held'])(
    'rechecks after claiming when the contact is %s',
    async (change) => {
      mocks.afterClaim = () => {
        if (change === 'removed') mocks.missing = true;
        if (change === 'inactive') mocks.status = 'void';
        if (change === 'email removed') mocks.email = null;
        if (change === 'email changed') mocks.email = 'new@example.com';
        if (change === 'rep email changed') mocks.savedEmail = 'rep-typed@example.com';
        if (change === 'held') mocks.held = true;
      };
      await sendProspectNoteEmail('contact');
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.sent).toBe(false);
    },
  );
  it('never auto-sends when a rep saved a different email', async () => {
    mocks.savedEmail = 'rep-typed@example.com';
    await sendProspectNoteEmail('contact');
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.savedEmail = mocks.email;
    await sendProspectNoteEmail('contact');
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: mocks.email }));
  });
  it('waits until a held note goes live', async () => {
    mocks.held = true;
    expect(await sendProspectNoteEmail('contact')).toBe('held');
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.held = false;
    await sendProspectNoteEmail('contact');
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('does nothing without email configuration, consent, or an email address', async () => {
    mocks.configured = false;
    await sendProspectNoteEmail('contact');
    mocks.configured = true;
    mocks.email = null; // A mobile-only contact is never messaged.
    await sendProspectNoteEmail('contact');
    mocks.email = 'prospect@example.com';
    mocks.consent = '';
    await sendProspectNoteEmail('contact');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not record a failed send, so the job can retry', async () => {
    mocks.send.mockRejectedValueOnce(new Error('unavailable'));
    await expect(sendProspectNoteEmail('contact')).rejects.toThrow('unavailable');
    expect(mocks.sent).toBe(false);
    await sendProspectNoteEmail('contact');
    expect(mocks.sent).toBe(true);
  });
  it('retries unexpected page resolution rather than permanently dropping delivery', async () => {
    mocks.resolve.mockResolvedValueOnce({ audience: 'owner' });
    await expect(sendProspectNoteEmail('contact')).rejects.toThrow('Prospect page unavailable');
    expect(mocks.sent).toBe(false);
    await sendProspectNoteEmail('contact');
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('does not deliver a removed or superseded contact', async () => {
    mocks.status = 'void';
    await sendProspectNoteEmail('contact');
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.status = 'active';
    mocks.resolve.mockResolvedValue({
      audience: 'prospect',
      held: false,
      session: { id: 'another-contact' },
    });
    await sendProspectNoteEmail('contact');
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
