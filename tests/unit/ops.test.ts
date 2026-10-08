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

describe('NFC Helper link', () => {
  it('builds a write link whose callback keeps the {serialnumber} placeholder', async () => {
    const { nfcHelperWriteLink } = await import('@/lib/ops/nfc-helper');
    const link = nfcHelperWriteLink(
      'https://insignar.app/c/K7M3PQ2X',
      'https://ops.example.com/ops/cards/K7M3PQ2X/written',
    );
    expect(link.startsWith('nfchelper://write?url=')).toBe(true);
    expect(link).toContain(encodeURIComponent('https://insignar.app/c/K7M3PQ2X'));
    expect(link).toContain('{serialnumber}');
    expect(link).not.toContain('%7Bserialnumber');
    const callback = decodeURIComponent(link.split('&callback=')[1]!);
    expect(callback).toBe(
      'https://ops.example.com/ops/cards/K7M3PQ2X/written?tagid={serialnumber}',
    );
  });

  it('normalises serial numbers and rejects junk', async () => {
    const { normaliseTagUid } = await import('@/lib/ops/nfc-helper');
    expect(normaliseTagUid('04:a2:3b:1c:55:80:61')).toBe('04A23B1C558061');
    expect(normaliseTagUid(' 04 A2 3B 1C 55 80 61 ')).toBe('04A23B1C558061');
    expect(normaliseTagUid('{serialnumber}')).toBeNull();
    expect(normaliseTagUid('zz')).toBeNull();
    expect(normaliseTagUid(null)).toBeNull();
  });
});

describe('safe redirect after sign-in', () => {
  it('allows in-app paths and refuses anything that can leave the site', async () => {
    const { safeNextPath } = await import('@/lib/auth/safe-next');
    expect(safeNextPath('/ops')).toBe('/ops');
    expect(safeNextPath('/ops/cards/ABCDEFGH/written?tagid=04A2')).toBe(
      '/ops/cards/ABCDEFGH/written?tagid=04A2',
    );
    for (const bad of [
      '//evil.com',
      '/\\evil.com',
      '/\\/evil.com',
      'https://evil.com',
      'javascript:alert(1)',
      '/ok\nhttps://evil.com',
      '/ok\u0000',
      '',
      null,
      undefined,
      42,
    ]) {
      expect(safeNextPath(bad)).toBe('/dashboard');
    }
    expect(safeNextPath('//evil.com', '')).toBe('');
  });
});

describe('write callback trust', () => {
  it('accepts app-opened and same-site-redirected requests, refuses cross-site ones', async () => {
    const { isTrustedNavigation } = await import('@/lib/ops/nfc-helper');
    expect(isTrustedNavigation('none')).toBe(true);
    expect(isTrustedNavigation('same-origin')).toBe(true);
    expect(isTrustedNavigation(null)).toBe(true);
    expect(isTrustedNavigation('cross-site')).toBe(false);
    expect(isTrustedNavigation('same-site')).toBe(false);
  });
});

describe('what a staff tap does', () => {
  it('first check previews, even for the owner; repeat taps depend on who taps', async () => {
    const { decideStaffTap } = await import('@/lib/ops/staff-tap');
    expect(decideStaffTap('verified', 'rep')).toBe('preview');
    expect(decideStaffTap('verified', 'owner')).toBe('preview');
    // staff who own the card get their own page once it is checked
    expect(decideStaffTap('already_verified', 'rep')).toBe('continue');
    // staff tapping someone else's unused card file nothing
    expect(decideStaffTap('already_verified', 'owner')).toBe('preview');
    expect(decideStaffTap('not_applicable', 'rep')).toBe('continue');
    expect(decideStaffTap('not_applicable', 'prospect')).toBe('continue');
  });
});

describe('who sees what on /c/CODE', () => {
  it('owner signed in gets the rep page; signed out or another user gets the prospect side', async () => {
    const { decideAudience } = await import('@/lib/domain/audience');
    const card = { user_id: 'owner-1' };
    expect(decideAudience(card, 'owner-1')).toBe('rep');
    expect(decideAudience(card, null)).toBe('prospect');
    expect(decideAudience(card, 'someone-else')).toBe('prospect');
  });
});
