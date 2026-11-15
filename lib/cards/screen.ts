/** The deadline applies only until the first scan binds the card. */
export const SCREEN_QR_LIFETIME_MS = 30 * 60 * 1000;

export function screenQrExpiresAt(issuedAt: string): number {
  return Date.parse(issuedAt) + SCREEN_QR_LIFETIME_MS;
}

export type ScreenQr = { code: string; url: string; svg: string; expiresAt: string };
export type ScreenQrStatus =
  { status: 'waiting' | 'expired' } | { status: 'scanned'; sessionId: string };
