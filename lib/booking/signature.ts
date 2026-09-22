import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Kept apart from cal.ts so the prospect page's booking component, which imports
// cal.ts, never pulls node:crypto into the browser bundle.

/**
 * Verifies `x-cal-signature-256`: the hex HMAC-SHA256 of the raw body under the
 * webhook secret. Constant-time, and checked BEFORE the body is parsed (§19.1).
 */
export function verifyCalSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
