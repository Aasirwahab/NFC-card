/**
 * The two URLs a card carries. One code, two ways in:
 *   - the NFC tag holds `/c/CODE` (a tag cannot be re-pointed, so no extras);
 *   - the printed QR holds `/c/CODE?src=qr`, which is how taps are told apart.
 * `viewSource()` in lib/domain/audience.ts reads the `src` value back.
 */
function trimOrigin(origin: string): string {
  return origin.replace(/\/+$/, '');
}

export function tagUrl(origin: string, code: string): string {
  return `${trimOrigin(origin)}/c/${code}`;
}

export function qrUrl(origin: string, code: string): string {
  return `${tagUrl(origin, code)}?src=qr`;
}
