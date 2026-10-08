import { describe, expect, it } from 'vitest';
import { isStaffEmail } from '@/lib/auth/staff-check';
import { qrUrl, tagUrl } from '@/lib/cards/urls';
import { cardProgress, isLowStock, stockByUser } from '@/lib/ops/stock';
import { serverEnvSchema } from '@/lib/env.schema';
import { viewSource } from '@/lib/domain/audience';

describe('staff gate', () => {
  const allowed = ['zaid@insignar.com', 'aasir@insignar.com'];

  it('lets a listed email in, ignoring case and spaces', () => {
    expect(isStaffEmail(' Zaid@Insignar.com ', allowed)).toBe(true);
  });

  it('refuses everyone else, a missing email and an empty list', () => {
    expect(isStaffEmail('adam@example.com', allowed)).toBe(false);
    expect(isStaffEmail('', allowed)).toBe(false);
    expect(isStaffEmail(null, allowed)).toBe(false);
    expect(isStaffEmail('zaid@insignar.com', [])).toBe(false);
  });

  it('does not match on a suffix or a prefix', () => {
    expect(isStaffEmail('evil-zaid@insignar.com', allowed)).toBe(false);
    expect(isStaffEmail('zaid@insignar.com.evil.io', allowed)).toBe(false);
  });

  it('STAFF_EMAILS parses to lowercase entries and defaults to nobody', () => {
    const base = {
      SUPABASE_URL: 'http://localhost:1',
      SUPABASE_SERVICE_ROLE_KEY: 'x',
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:1',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      WORKER_SECRET: 'w'.repeat(24),
      CRON_SECRET: 'c'.repeat(24),
    };
    expect(serverEnvSchema.parse(base).STAFF_EMAILS).toEqual([]);
    expect(serverEnvSchema.parse({ ...base, STAFF_EMAILS: '' }).STAFF_EMAILS).toEqual([]);
    expect(
      serverEnvSchema.parse({ ...base, STAFF_EMAILS: ' A@x.com, b@X.com ,' }).STAFF_EMAILS,
    ).toEqual(['a@x.com', 'b@x.com']);
  });
});

describe('card URLs', () => {
  it('the tag holds the bare link and the QR adds the source', () => {
    expect(tagUrl('https://insignar.app/', 'K7M3PQ2X')).toBe('https://insignar.app/c/K7M3PQ2X');
    expect(qrUrl('https://insignar.app', 'K7M3PQ2X')).toBe(
      'https://insignar.app/c/K7M3PQ2X?src=qr',
    );
  });

  it('the QR link is read back as a QR scan and the tag link as a tap', () => {
    expect(viewSource('qr')).toBe('qr');
    expect(viewSource(undefined)).toBe('nfc');
  });
});

describe('stock', () => {
  const card = (user_id: string, status: string, w: string | null, v: string | null) => ({
    user_id,
    status,
    written_at: w,
    verified_at: v,
  });

  it('counts per rep and splits programming progress', () => {
    const t = '2026-10-09T10:00:00Z';
    const stock = stockByUser([
      card('a', 'available', null, null),
      card('a', 'available', t, null),
      card('a', 'available', t, t),
      card('a', 'assigned', t, t),
      card('a', 'voided', null, null),
      card('b', 'available', null, null),
    ]);
    expect(stock.get('a')).toEqual({
      inStock: 3,
      handedOut: 1,
      lost: 1,
      needsWriting: 1,
      needsVerifying: 1,
    });
    expect(stock.get('b')?.inStock).toBe(1);
  });

  it('low stock is at or under the rep level', () => {
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
    expect(isLowStock(0, 0)).toBe(true);
  });

  it('progress goes issued, written, verified', () => {
    expect(cardProgress({ written_at: null, verified_at: null })).toBe('issued');
    expect(cardProgress({ written_at: 'x', verified_at: null })).toBe('written');
    expect(cardProgress({ written_at: 'x', verified_at: 'y' })).toBe('verified');
  });
});

describe('shared profile schema (rep settings and ops edit)', () => {
  it('accepts a complete profile and turns blanks into null', async () => {
    const { profileSchema } = await import('@/lib/schemas/profile');
    const p = profileSchema.parse({
      full_name: 'Adam Smith',
      title: '',
      booking_url: 'https://cal.com/adam/15min',
      contact_email: 'adam@example.com',
      timezone: 'Europe/London',
    });
    expect(p.title).toBeNull();
    expect(p.booking_url).toBe('https://cal.com/adam/15min');
  });

  it('rejects a short name, a non-https booking link and a bad email', async () => {
    const { profileSchema } = await import('@/lib/schemas/profile');
    expect(profileSchema.safeParse({ full_name: 'A' }).success).toBe(false);
    expect(
      profileSchema.safeParse({ full_name: 'Adam', booking_url: 'http://cal.com/adam/15min' })
        .success,
    ).toBe(false);
    expect(profileSchema.safeParse({ full_name: 'Adam', contact_email: 'nope' }).success).toBe(
      false,
    );
  });

  it('falls back to UTC for an unknown timezone', async () => {
    const { profileSchema } = await import('@/lib/schemas/profile');
    expect(profileSchema.parse({ full_name: 'Adam', timezone: 'Mars/Base' }).timezone).toBe('UTC');
  });
});

describe('card state wording', () => {
  const t = '2026-10-09T10:00:00Z';
  it('walks issued, written, active, in use and voided', async () => {
    const { describeCard } = await import('@/lib/ops/stock');
    expect(describeCard({ status: 'available', written_at: null, verified_at: null }).label).toBe(
      'Issued',
    );
    expect(describeCard({ status: 'available', written_at: t, verified_at: null }).label).toBe(
      'Written, not checked',
    );
    const active = describeCard({ status: 'available', written_at: t, verified_at: t });
    expect(active.label).toBe('Active');
    expect(active.detail).toMatch(/portfolio/);
    expect(describeCard({ status: 'assigned', written_at: t, verified_at: t }).label).toBe(
      'In use',
    );
    expect(describeCard({ status: 'voided', written_at: null, verified_at: null }).tone).toBe(
      'off',
    );
  });
});
