import { describe, expect, it } from 'vitest';
import {
  isProspectHolding,
  maskContact,
  prospectAnswersSchema,
  normaliseProspectContact,
} from '@/lib/domain/prospect-answers';

const now = Date.parse('2026-11-13T12:00:00Z');
describe('tap-first holding window', () => {
  it('requires an unsaved contact and a first tap within 24 hours', () => {
    expect(isProspectHolding(null, '2026-11-12T12:00:01Z', now)).toBe(true);
    expect(isProspectHolding(null, '2026-11-12T12:00:00Z', now)).toBe(false);
    expect(isProspectHolding('2026-11-13T10:00:00Z', '2026-11-13T09:00:00Z', now)).toBe(false);
    expect(isProspectHolding(null, null, now)).toBe(false);
    expect(isProspectHolding(null, 'invalid', now)).toBe(false);
    expect(isProspectHolding(null, '2026-11-13T12:00:01Z', now)).toBe(false);
  });
});
describe('prospect answer boundary', () => {
  it('allows at most two distinct problem chips and unticking everything', () => {
    expect(prospectAnswersSchema.safeParse({ problems: ['A', 'B'] }).success).toBe(true);
    expect(prospectAnswersSchema.safeParse({ problems: [] }).success).toBe(true);
    expect(prospectAnswersSchema.safeParse({ problems: ['A', 'B', 'C'] }).success).toBe(false);
    expect(prospectAnswersSchema.safeParse({ problems: ['A', 'A'] }).success).toBe(false);
  });
  it('rejects free text, empty bodies, contact without consent, and consent alone', () => {
    for (const body of [
      { note: 'anything' },
      {},
      { contact: 'a@example.com' },
      { consent: true },
      { contact: 'a@example.com', consent: false },
    ]) {
      expect(prospectAnswersSchema.safeParse(body).success).toBe(false);
    }
  });
  it('accepts a lowercased email capped at 254 characters', () => {
    expect(normaliseProspectContact(' A@EXAMPLE.COM ')).toEqual({
      email: 'a@example.com',
      phone: null,
    });
    expect(
      prospectAnswersSchema.safeParse({ contact: 'A@EXAMPLE.COM', consent: true }).success,
    ).toBe(true);
    expect(normaliseProspectContact('a'.repeat(250) + '@example.com')).toBeNull();
  });
  it('normalises UK mobiles with the capture phone comparer and rejects other input', () => {
    for (const phone of [
      '07700 900123',
      '+44 7700 900123',
      '0044 7700 900123',
      '+44 (0)7700 900123',
    ]) {
      expect(normaliseProspectContact(phone)).toEqual({ email: null, phone: '+447700900123' });
    }
    for (const phone of [
      '020 7946 0958',
      '+1 7700 900123',
      'hello 07700900123',
      '077009001234',
      '07000900123',
      '07600900123',
      'not an email',
    ]) {
      expect(normaliseProspectContact(phone)).toBeNull();
    }
  });
});
describe('maskContact', () => {
  it('keeps the first letter and the domain of an email, never the rest', () => {
    expect(maskContact('bella@example.test', null)).toBe('b•••@example.test');
  });
  it('keeps only the last three digits of a mobile', () => {
    expect(maskContact(null, '+447700900123')).toBe('•••• ••• 123');
  });
  it('is null when nothing was left', () => {
    expect(maskContact(null, null)).toBeNull();
  });
});
