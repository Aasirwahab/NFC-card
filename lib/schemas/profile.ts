import { z } from 'zod';
import { parseBookingUrl } from '@/lib/booking/link';

export const blank = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null);

/** An IANA zone name the runtime recognises, else UTC. Never trusts the client blindly. */
function knownTimezone(value: string): string {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return value;
  } catch {
    return 'UTC';
  }
}

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your name.').max(120),
  language: z.enum(['en-GB', 'en-US']).default('en-GB'),
  timezone: z
    .string()
    .trim()
    .max(64)
    .default('UTC')
    .transform((value) => knownTimezone(value || 'UTC')),
  title: blank(120),
  bio: blank(600),
  linkedin_url: blank(300),
  phone: blank(40),
  // The rep's Cal.com event, embedded on every prospect page (§19.1).
  booking_url: blank(300).refine(
    (v) => v === null || parseBookingUrl(v) !== null,
    'Paste your Cal.com link, e.g. https://cal.com/you/15min',
  ),
  // On the vCard a prospect saves from the page. Optional, and deliberately not
  // the sign-in address, which is not the rep's to publish by default.
  contact_email: blank(254).refine(
    (v) => v === null || z.string().email().safeParse(v).success,
    'Enter a valid email, or leave it blank.',
  ),
});
