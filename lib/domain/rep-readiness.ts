import { parseBookingUrl } from '@/lib/booking/link';
import { publicEventName } from '@/lib/domain/pitch';
import type { Stock } from '@/lib/ops/stock';
import { linkedinHref } from './linkedin';

export function eventOwnersWithRealEvents(events: { user_id: string; name: string | null }[]) {
  return new Set(
    events.filter((event) => publicEventName(event.name) !== null).map((event) => event.user_id),
  );
}

type ReadinessInput = {
  profile: {
    full_name: string | null;
    title: string | null;
    photo_url: string | null;
    booking_url: string | null;
    linkedin_url: string | null;
  } | null;
  business: {
    company_name: string;
    tagline: string | null;
    services: string[];
  } | null;
  stock: Pick<Stock, 'inStock' | 'needsWriting' | 'needsVerifying'>;
  hasEvent: boolean;
};

export function repReadiness({ profile, business, stock, hasEvent }: ReadinessInput) {
  const checks: [string, boolean][] = [
    ['Verified card in stock', stock.inStock - stock.needsWriting - stock.needsVerifying > 0],
    ['Full name', Boolean(profile?.full_name?.trim())],
    ['Title', Boolean(profile?.title?.trim())],
    ['Photo', Boolean(profile?.photo_url?.trim())],
    ['Company', Boolean(business?.company_name?.trim())],
    ['Tagline', Boolean(business?.tagline?.trim())],
    ['At least one service', Boolean(business?.services.some((service) => service.trim()))],
    ['LinkedIn', Boolean(linkedinHref(profile?.linkedin_url ?? null))],
    ['Valid booking link', Boolean(parseBookingUrl(profile?.booking_url))],
    ['At least one event', hasEvent],
  ];
  const missing = checks.filter(([, present]) => !present).map(([label]) => label);
  return { ready: missing.length === 0, missing };
}
