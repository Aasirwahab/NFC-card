import { parseBookingUrl } from '@/lib/booking/link';
import { linkedinHref } from './linkedin';

/** Use the same link gates as the public page, so present means it will be shown. */
export function publicProfileCheck(
  profile: {
    photo_url: string | null;
    booking_url: string | null;
    linkedin_url: string | null;
  } | null,
  business: { tagline: string | null; services: string[] } | null,
) {
  return [
    { label: 'Photo', href: '#public-photo', present: Boolean(profile?.photo_url?.trim()) },
    { label: 'Tagline', href: '#tagline', present: Boolean(business?.tagline?.trim()) },
    {
      label: 'Services',
      href: '#services',
      present: Boolean(business?.services.some((s) => s.trim())),
    },
    {
      label: 'Booking link',
      href: '#booking_url',
      present: Boolean(parseBookingUrl(profile?.booking_url)),
    },
    {
      label: 'LinkedIn',
      href: '#linkedin_url',
      present: Boolean(linkedinHref(profile?.linkedin_url ?? null)),
    },
  ];
}

/** Public business links accept web URLs only, never credentials or script schemes. */
export function publicWebsiteHref(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
