/**
 * Profile photo rules, PURE so the route and the tests share them.
 *
 * The browser crops and re-encodes the photo to a square JPEG before upload
 * (which also strips location data from an iPhone picture); the server does not
 * trust that and re-checks the bytes.
 */

export const MAX_PHOTO_BYTES = 1_000_000;

/** A JPEG starts FF D8 FF. Anything else is refused whatever its declared type. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export type PhotoCheck = { ok: true } | { ok: false; error: 'empty' | 'too_large' | 'not_jpeg' };

export function checkPhoto(bytes: Uint8Array): PhotoCheck {
  if (bytes.length === 0) return { ok: false, error: 'empty' };
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, error: 'too_large' };
  if (!isJpeg(bytes)) return { ok: false, error: 'not_jpeg' };
  return { ok: true };
}

/** The storage object path inside the bucket for a URL we issued, else null. */
export function ownPhotoPath(url: string | null, bucketUrlPrefix: string): string | null {
  if (!url || !url.startsWith(bucketUrlPrefix)) return null;
  const path = url.slice(bucketUrlPrefix.length).split('?')[0] ?? '';
  return path.length > 0 ? path : null;
}
