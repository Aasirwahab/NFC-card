import { describe, expect, it } from 'vitest';
import { earlyAccessSchema } from '@/lib/schemas/early-access';

/** What the form posts when every field is filled in. */
const valid = {
  name: '  Priya Nair ',
  email: ' Priya@Example.COM ',
  role: 'Founder, Northwind Freight',
  nextEvent: '',
  consent: 'on',
  ref: 'card',
};

describe('earlyAccessSchema', () => {
  it('trims the name and lowercases the email, to match the database check', () => {
    const parsed = earlyAccessSchema.parse(valid);
    expect(parsed.name).toBe('Priya Nair');
    expect(parsed.email).toBe('priya@example.com');
  });

  it('stores a blank optional field as null, not an empty string', () => {
    expect(earlyAccessSchema.parse(valid).nextEvent).toBeNull();
    expect(earlyAccessSchema.parse({ ...valid, role: null }).role).toBeNull();
  });

  it('refuses a request without consent', () => {
    const result = earlyAccessSchema.safeParse({ ...valid, consent: null });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Please tick the box so we can contact you.');
  });

  it('refuses a missing name and a malformed email', () => {
    expect(earlyAccessSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
    expect(earlyAccessSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });

  it('keeps a plain ref and drops anything else instead of refusing the request', () => {
    expect(earlyAccessSchema.parse(valid).ref).toBe('card');
    expect(earlyAccessSchema.parse({ ...valid, ref: '<script>' }).ref).toBeNull();
    expect(earlyAccessSchema.parse({ ...valid, ref: 'x'.repeat(65) }).ref).toBeNull();
    expect(earlyAccessSchema.parse({ ...valid, ref: null }).ref).toBeNull();
  });

  it('enforces the same length limits as the database', () => {
    expect(earlyAccessSchema.safeParse({ ...valid, name: 'x'.repeat(121) }).success).toBe(false);
    expect(earlyAccessSchema.safeParse({ ...valid, role: 'x'.repeat(201) }).success).toBe(false);
  });
});
