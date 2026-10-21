import 'server-only';
import { safeFetch, type SafeFetchResult } from '@/lib/http/safe-fetch';

export type BookingCheck = 'ok' | 'missing' | 'unknown';

/**
 * Does the rep's booking link open a calendar? Checked when Setup saves it, so a
 * typo never reaches a prospect as a broken "Pick a time". A 404 or 410 means the
 * calendar does not exist; any other failure (timeout, network) is 'unknown' and
 * does not block saving.
 */
export async function checkBookingLink(
  url: string,
  fetcher: (url: string) => Promise<Pick<SafeFetchResult, 'status'>> = (u) =>
    safeFetch(u, { timeoutMs: 5_000, maxBytes: 200_000 }),
): Promise<BookingCheck> {
  try {
    const { status } = await fetcher(url);
    if (status === 404 || status === 410) return 'missing';
    return status >= 200 && status < 400 ? 'ok' : 'unknown';
  } catch {
    return 'unknown';
  }
}
