/**
 * Card codes (spec §22.1).
 *
 * Alphabet: 31 characters, with I, L, O, 0 and 1 removed so a code read off a
 * card is never mistyped. `/scan` survives only as manual code entry, which is
 * why the code is printed on the card beside the short URL (§8).
 *
 * Length: 8 characters (~8.5 x 10^12 combinations). Six gives 887 million, which
 * is fine for a hundred cards and thin once there are customers with tens of
 * thousands. Two extra characters cost nothing.
 *
 * Codes are not secrets, but they are the only thing protecting a prospect's
 * details — hence the length and the rate limit (§22.2).
 *
 * This module is PURE: the randomness is injected, so the generator is testable
 * and the modulo-bias rejection can be asserted rather than assumed.
 */

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

/**
 * The largest multiple of the alphabet size that fits in a byte. Bytes at or
 * above this are rejected rather than folded, which is what keeps every
 * character equally likely (§22.1: "rejection sampling to avoid modulo bias").
 */
const REJECTION_CEILING = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length; // 248

/** Fills the given buffer with random bytes. Injected so tests can be exact. */
export type RandomBytes = (size: number) => Uint8Array;

export function generateCode(randomBytes: RandomBytes, length: number = CODE_LENGTH): string {
  let out = '';
  while (out.length < length) {
    // Over-request: on average ~3% of bytes are rejected, so a little slack
    // avoids a second round trip in the overwhelming majority of calls.
    const needed = length - out.length;
    const bytes = randomBytes(needed + 8);
    for (const byte of bytes) {
      if (out.length === length) break;
      if (byte >= REJECTION_CEILING) continue; // reject, do not fold
      out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return out;
}

/** Generates `count` distinct codes. Collisions inside a batch are retried here;
 *  the unique constraint in the database is the real guard (§22.1). */
export function generateCodes(
  randomBytes: RandomBytes,
  count: number,
  length: number = CODE_LENGTH,
): string[] {
  const codes = new Set<string>();
  // A generous ceiling: at 8 characters a collision inside one batch is
  // vanishingly unlikely, so this only ever guards against a broken RNG.
  const maxAttempts = count * 10 + 100;
  let attempts = 0;
  while (codes.size < count) {
    if (++attempts > maxAttempts) {
      throw new Error(`Could not generate ${count} distinct codes — is the RNG working?`);
    }
    codes.add(generateCode(randomBytes, length));
  }
  return [...codes];
}

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

/**
 * Normalises what a human typed at `/scan`: trims, upper-cases, and strips the
 * spaces and dashes people add when reading a code aloud off a card.
 *
 * It deliberately does no character folding. The alphabet already excludes every
 * confusable character, so a typed I, L, O, 0 or 1 is a genuine misread with no
 * single right answer — and guessing would resolve one prospect's code to another
 * prospect's card. An unrecognised code gets the same generic 404 as any other
 * miss (§22.2).
 */
export function normaliseCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, '');
}
