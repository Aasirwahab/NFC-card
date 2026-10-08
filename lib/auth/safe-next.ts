/**
 * Where to send someone after sign-in. Only a path inside this app is allowed.
 *
 * `startsWith('/')` alone is not enough: browsers read `/\\evil.com` as
 * `//evil.com`, an address on another site. So backslashes and control
 * characters are refused, and the result is checked by parsing it.
 */
export function safeNextPath(value: unknown, fallback = '/dashboard'): string {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, 'http://app.invalid');
    if (parsed.origin !== 'http://app.invalid') return fallback;
  } catch {
    return fallback;
  }
  return value;
}
