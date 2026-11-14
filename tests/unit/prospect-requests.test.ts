import { describe, expect, it } from 'vitest';
import {
  normaliseRequestContact,
  prospectRequestSchema,
  requestConsent,
  REQUEST_CONSENT_VERSION,
} from '@/lib/domain/prospect-requests';

describe('prospect request validation and consent', () => {
  const input = { kind: 'details', channel: 'email', contact: ' A@EXAMPLE.COM ', consent: true };
  it('requires explicit consent and accepts no prospect text beyond the contact value', () => {
    expect(prospectRequestSchema.safeParse(input).success).toBe(true);
    expect(prospectRequestSchema.safeParse({ ...input, consent: false }).success).toBe(false);
    expect(prospectRequestSchema.safeParse({ ...input, consent: undefined }).success).toBe(false);
    expect(prospectRequestSchema.safeParse({ ...input, note: 'Please call' }).success).toBe(false);
    expect(prospectRequestSchema.safeParse({ ...input, bestTime: 'in ten minutes' }).success).toBe(
      false,
    );
  });
  it('normalises the selected channel without changing the channel consented to', () => {
    expect(normaliseRequestContact('email', input.contact)).toBe('a@example.com');
    for (const channel of ['call', 'text', 'whatsapp'] as const) {
      expect(normaliseRequestContact(channel, '07700 900123')).toBe('+447700900123');
      expect(normaliseRequestContact(channel, 'a@example.com')).toBeNull();
    }
    expect(normaliseRequestContact('email', '07700900123')).toBeNull();
  });
  it.each([
    '+441234567890',
    '+447600900123',
    '07700900123?body=x',
    '07700\n900123',
    'x'.repeat(255),
  ])('rejects invalid or hostile contact %j', (contact) => {
    expect(prospectRequestSchema.safeParse({ ...input, channel: 'text', contact }).success).toBe(
      false,
    );
  });
  it('pins the single-contact consent copy and its stored version', () => {
    expect(REQUEST_CONSENT_VERSION).toBe('2026-11-14-v1');
    expect(requestConsent('Sam', 'whatsapp')).toBe(
      'Sam will contact you once by WhatsApp about this. Nothing else.',
    );
  });
});
