import { describe, expect, it } from 'vitest';
import { redactContacts, routeKnownIntent } from '@/lib/chat/intent';
import { availableActions } from '@/lib/landing/actions';
import { claimFailures } from '@/lib/enrich/gate';
import { snapshotSchema } from '@/lib/enrich/snapshot';

const snapshot = snapshotSchema.parse({
  session: {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: '22222222-2222-4222-8222-222222222222',
    status: 'active',
    details_revision: 1,
  },
  rep: { full_name: 'Sam', booking_url: null, linkedin_url: 'https://linkedin.com/in/sam' },
  business: { company_name: 'Studio', services: ['Booking software'], pricing: null },
  knowledge: [],
});
const actions = availableActions(snapshot, { emailEnabled: false });

describe('router: callback requests are caught, questions are never hijacked', () => {
  it.each([
    'call me back',
    'can you call me',
    'give me a call',
    "I'd like a call",
    'Could I have a callback please',
    'get back to me tomorrow',
    'please text me',
    'Ask Sam to call me tomorrow',
    'My email is jane@example.com',
    'jane@example.com',
    '07700 900123',
    'my number is 07700.900.123',
  ])('routes "%s" to an action without promising anything', (message) => {
    const result = routeKnownIntent(message, actions);
    expect(result?.outcome).toBe('action');
    expect(result?.reply).not.toMatch(
      /\b(?:will|noted|call you|get back to you|pass (?:it|that) on)\b/i,
    );
  });

  it.each([
    'Is jane@example.com your support address?',
    'Does it integrate with HubSpot, my email is jane@example.com',
    'Do you build booking software that can call me when a slot opens up for the whole team?',
    'What is 2023-2024 pricing like for clinics?',
    'Do you offer a call centre product?',
  ])('lets "%s" reach the model', (message) => {
    expect(routeKnownIntent(message, actions)).toBeNull();
  });

  it('redacts dotted phone numbers too', () => {
    expect(redactContacts('ring 07700.900.123 or 07700 900123')).not.toMatch(/\d{5}/);
  });
});

describe('price gate: the billing term must match the stored pricing', () => {
  const pricing = '£299 one-time setup. Monthly care plans from £150. Projects start from £2,500.';
  const failures = (text: string) =>
    claimFailures(text, pricing, pricing, true, pricing).filter(
      (f) => f.check === 'unsupported_price',
    );

  it('rejects "£299 per month" when the pricing says one-time', () => {
    expect(failures('The setup is £299 per month.')).not.toEqual([]);
  });

  it('accepts the stored billing in either word order', () => {
    expect(failures('Setup is £299 one-time.')).toEqual([]);
    expect(failures('Care plans are £150 a month.')).toEqual([]);
    expect(failures('Monthly plans start from £150.')).toEqual([]);
    expect(failures('Projects start from £2,500.')).toEqual([]);
  });

  it('keeps two prices in one sentence apart', () => {
    expect(failures('It is £150 a month or £2,500 once.')).toEqual([]);
    expect(failures('It is £150 a month or £299 a month.')).toHaveLength(1);
  });

  it('still rejects an amount that is not stored', () => {
    expect(failures('It costs £400.')).not.toEqual([]);
  });
});

describe('price gate: amounts, not stray digits', () => {
  const check = (text: string, pricing: string) =>
    claimFailures(text, pricing, pricing, true, pricing).filter(
      (f) => f.check === 'unsupported_price',
    );

  it('does not let "30 days" authorise "£30"', () => {
    const pricing = 'Tier 1: £500, with a 30 days guarantee.';
    expect(check('It costs £30.', pricing)).not.toEqual([]);
    expect(check('Tier 1 is £500.', pricing)).toEqual([]);
  });

  it('compares by value, not by spelling', () => {
    expect(check('It is £50.', 'Sessions are £50.00.')).toEqual([]);
    expect(check('It is £1k.', 'Projects are £1,000.')).toEqual([]);
    expect(check('It is £1,000.', 'Projects are £1k.')).toEqual([]);
    expect(check('It is £51.', 'Sessions are £50.00.')).not.toEqual([]);
  });

  it('falls back to bare numbers when the pricing has no currency amounts', () => {
    expect(check('The Pro plan is £900.', 'Starter 500, Pro 900')).toEqual([]);
    expect(check('The Pro plan is £700.', 'Starter 500, Pro 900')).not.toEqual([]);
  });
});
