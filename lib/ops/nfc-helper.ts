/**
 * Integration with NFC Helper, a free iPhone app that writes a URL to a tag and
 * then opens a callback URL with the tag's serial number:
 *
 *   nfchelper://write?url=<URL to write>&callback=<callback>
 *
 * The app substitutes `{serialnumber}` in the callback. Documented at
 * https://nfchelper.woy.app/docs. The callback is a plain GET, so it is only ever
 * honoured for a signed-in staff member (see the written route).
 */
export function nfcHelperWriteLink(tagUrl: string, callbackBase: string): string {
  // `{serialnumber}` must reach the app unencoded-as-a-token, so it is appended
  // after the base is encoded: the app finds and replaces the literal placeholder.
  const callback = `${callbackBase}${callbackBase.includes('?') ? '&' : '?'}tagid={serialnumber}`;
  return `nfchelper://write?url=${encodeURIComponent(tagUrl)}&callback=${encodeURIComponent(callback).replace(/%7Bserialnumber%7D/gi, '{serialnumber}')}`;
}

/**
 * A serial number as the app may report it: hex, possibly with colons or spaces.
 * Returns uppercase hex with no separators, or null if it is not a plausible UID.
 */
export function normaliseTagUid(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hex = raw.replace(/[:\s-]/g, '').toUpperCase();
  return /^[0-9A-F]{8,32}$/.test(hex) ? hex : null;
}

/**
 * `Sec-Fetch-Site` for the write callback. NFC Helper opens it from outside the
 * browser ('none'); a signed-in staff page may redirect to it ('same-origin').
 * 'cross-site' and 'same-site' mean another page caused the request. A missing
 * header (an old browser) is let through.
 */
export function isTrustedNavigation(secFetchSite: string | null): boolean {
  return secFetchSite === null || secFetchSite === 'none' || secFetchSite === 'same-origin';
}
