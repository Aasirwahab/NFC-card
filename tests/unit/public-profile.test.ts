import { expect, test } from 'vitest';
import { publicProfileCheck, publicWebsiteHref } from '@/lib/domain/public-profile';

test('public profile checks match visible fields and allow only safe website links', () => {
  expect(publicWebsiteHref(' example.com/about?ref=card ')).toBe(
    'https://example.com/about?ref=card',
  );
  expect(publicWebsiteHref('http://example.com/about')).toBe('http://example.com/about');
  for (const value of [
    null,
    '',
    'javascript:alert(1)',
    'ftp://example.com',
    'https://u:p@example.com',
    'https://',
  ]) {
    expect(publicWebsiteHref(value)).toBeNull();
  }
  expect(publicProfileCheck(null, null).map((field) => field.present)).toEqual(
    Array(5).fill(false),
  );
  const profile = {
    photo_url: 'photo.jpg',
    booking_url: 'https://cal.com/maya/meeting',
    linkedin_url: 'https://linkedin.com/in/maya',
  };
  const business = { tagline: 'A useful introduction', services: ['Release health checks'] };
  expect(
    publicProfileCheck(profile, business).map((field) => [field.label, field.present]),
  ).toEqual([
    ['Photo', true],
    ['Tagline', true],
    ['Services', true],
    ['Booking link', true],
    ['LinkedIn', true],
  ]);
  expect(
    publicProfileCheck(
      { ...profile, booking_url: 'javascript:alert(1)', linkedin_url: 'https://example.com' },
      { tagline: ' ', services: [' '] },
    ).map((field) => field.present),
  ).toEqual([true, false, false, false, false]);
});
