import { expect, it } from 'vitest';
import { repReadiness } from '@/lib/domain/rep-readiness';

it('requires prepared stock, a complete profile, valid booking and an event without email', () => {
  const complete = {
    profile: {
      full_name: 'Pilot Rep',
      title: 'Consultant',
      photo_url: '/photo.jpg',
      booking_url: 'https://cal.com/rep/intro',
      linkedin_url: 'https://linkedin.com/in/rep',
    },
    business: { company_name: 'Company', tagline: 'Helping teams', services: ['Consulting'] },
    stock: { inStock: 3, needsWriting: 1, needsVerifying: 1 },
    hasEvent: true,
  };
  expect(repReadiness(complete)).toEqual({ ready: true, missing: [] });
  expect(
    repReadiness({ ...complete, stock: { inStock: 2, needsWriting: 1, needsVerifying: 1 } }),
  ).toEqual({ ready: false, missing: ['Verified card in stock'] });
  expect(
    repReadiness({
      ...complete,
      profile: {
        ...complete.profile,
        full_name: ' ',
        booking_url: 'http://cal.com/rep',
        linkedin_url: null,
      },
      business: { ...complete.business, services: [' '] },
      hasEvent: false,
    }),
  ).toEqual({
    ready: false,
    missing: [
      'Full name',
      'At least one service',
      'LinkedIn',
      'Valid booking link',
      'At least one event',
    ],
  });
  expect(
    repReadiness({
      profile: null,
      business: null,
      stock: { inStock: 0, needsWriting: 0, needsVerifying: 0 },
      hasEvent: false,
    }),
  ).toEqual({
    ready: false,
    missing: [
      'Verified card in stock',
      'Full name',
      'Title',
      'Photo',
      'Company',
      'Tagline',
      'At least one service',
      'LinkedIn',
      'Valid booking link',
      'At least one event',
    ],
  });
});
