/**
 * Constant-time bearer check for the worker and cron routes (spec §15.3).
 *
 * A plain `===` on a secret leaks its length and, in principle, its prefix
 * through timing. This walks the whole of both strings regardless of where they
 * first differ.
 *
 * PURE, so it is unit-tested directly.
 */
export function bearerMatches(authorization: string | null, secret: string): boolean {
  const prefix = 'Bearer ';
  if (!authorization || !authorization.startsWith(prefix) || secret.length === 0) return false;

  const provided = authorization.slice(prefix.length);
  // Compare over the longer length so a length mismatch costs the same as a
  // content mismatch, and fold the length difference into the result.
  const length = Math.max(provided.length, secret.length);
  let difference = provided.length ^ secret.length;
  for (let i = 0; i < length; i++) {
    difference |= (provided.charCodeAt(i) || 0) ^ (secret.charCodeAt(i) || 0);
  }
  return difference === 0;
}
