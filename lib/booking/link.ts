/**
 * The rep's Cal.com link (spec §19.1). PURE and dependency-free, because the
 * prospect page's booking component imports it: nothing here may add weight to
 * a page with a two-second budget (§16).
 */

/** The metadata key the embed sets and the webhook reads. */
export const SESSION_METADATA_KEY = 'session_id';

export type CalLink = { calOrigin: string; calLink: string };

/**
 * A rep's booking link, "https://cal.com/zaid/15min", split into what the embed
 * takes: the origin and the "zaid/15min" path. Https only, and at least a
 * username, or null.
 */
export function parseBookingUrl(value: string | null | undefined): CalLink | null {
  if (!value?.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;

  const calLink = url.pathname.replace(/^\/+|\/+$/g, '');
  if (!calLink || !/^[\w.-]+(?:\/[\w.-]+)*$/.test(calLink)) return null;

  return { calOrigin: url.origin, calLink };
}
