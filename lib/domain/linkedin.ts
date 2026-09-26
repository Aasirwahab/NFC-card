/** Only a real LinkedIn profile URL becomes a button — never a dead or odd link. */
export function linkedinHref(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, '');
    if (
      parsed.protocol !== 'https:' ||
      !(host === 'linkedin.com' || host.endsWith('.linkedin.com'))
    )
      return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
