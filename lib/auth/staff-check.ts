/**
 * Pure half of the staff gate, so it can be tested without a session.
 * `allowed` holds lowercase addresses (the env schema lowercases them).
 */
export function isStaffEmail(
  email: string | null | undefined,
  allowed: readonly string[],
): boolean {
  if (!email) return false;
  return allowed.includes(email.trim().toLowerCase());
}
