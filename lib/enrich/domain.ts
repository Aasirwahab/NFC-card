/**
 * Step 1 of the pipeline: which website belongs to the prospect's company? (§14)
 *
 * Deliberately conservative. Researching the WRONG company is worse than
 * researching none: the pitch would cite a stranger's facts to a prospect who
 * would notice at once. So a domain is used only when there is real evidence:
 *
 *   0. The website the rep recorded, or confirmed in the preview. A person
 *      checked it, so it outranks everything else.
 *   1. The prospect's own email domain, unless it is a free mail provider.
 *      Strongest signal there is — it is their employer's mail server.
 *   2. Otherwise, domains guessed from the company name — and a guess counts
 *      ONLY when that site's own homepage names the company (the caller checks,
 *      using `pageNamesCompany`). Even then it is only a SUGGESTION: every
 *      "ABC Services" site names "ABC Services". Its facts stay off the
 *      prospect's page until the rep confirms the site (brief.ts).
 *   3. Otherwise, none. The pipeline carries on without site research (§24.3:
 *      "a company site unreachable → pitch from remaining signals").
 *
 * There is no automated search here: LinkedIn is manual paste only in v1 (§6), and
 * a web-search step belongs with the model provider decision (§28).
 *
 * PURE. The fetching is the caller's.
 */

/** Consumer mail providers: an address here says nothing about the employer. */
const FREE_MAIL = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'live.co.uk',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.co.uk',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'btinternet.com',
  'sky.com',
  'virginmedia.com',
  'talktalk.net',
  'ntlworld.com',
  'blueyonder.co.uk',
  'fastmail.com',
  'hey.com',
]);

/** Legal and filler words that are part of a registered name but never of a domain. */
const NOISE = new Set([
  'the',
  'ltd',
  'limited',
  'plc',
  'llp',
  'llc',
  'inc',
  'incorporated',
  'co',
  'company',
  'group',
  'holdings',
  'uk',
  'gb',
  'international',
  'and',
]);

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** The employer's domain from a work email, or null for free mail or nonsense. */
export function domainFromEmail(email: string | null): string | null {
  const domain = email?.trim().toLowerCase().split('@')[1];
  if (!domain || !domain.includes('.') || FREE_MAIL.has(domain)) return null;
  return domain.split('.').every((label) => LABEL.test(label)) ? domain : null;
}

/**
 * The host of a website the rep typed — "abc.co.uk", "www.abc.co.uk/about" or
 * "https://abc.co.uk" all give "abc.co.uk". Null for anything that is not a
 * plausible public hostname, so a typo never becomes a fetch target.
 */
export function domainFromWebsite(website: string | null): string | null {
  const raw = website?.trim().toLowerCase();
  if (!raw) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '');
  if (!host.includes('.') || FREE_MAIL.has(host)) return null;
  return host.split('.').every((label) => LABEL.test(label)) ? host : null;
}

/** The company name reduced to the words that could appear in its domain. */
export function companyWords(name: string | null): string[] {
  return (name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((word) => word.length > 0 && !NOISE.has(word));
}

/** A stable cache key for a company name, so "BuildRite Plant Ltd." and "buildrite plant" match. */
export function companyKey(name: string | null): string | null {
  const words = companyWords(name);
  return words.length > 0 ? words.join('-') : null;
}

/**
 * Plausible domains for a company name, most likely first. UK first, because
 * that is where the product is sold (§3). Capped: each candidate costs a fetch.
 */
export function candidateDomains(name: string | null, limit = 5): string[] {
  const words = companyWords(name);
  if (words.length === 0) return [];

  const joined = words.join('');
  if (joined.length < 3) return [];

  const stems = [joined];
  if (words.length > 1) {
    stems.push(words.join('-'));
    if ((words[0] ?? '').length >= 4) stems.push(words[0]!);
  }

  const candidates: string[] = [];
  for (const stem of stems) {
    for (const tld of ['co.uk', 'com', 'uk']) {
      if (LABEL.test(stem)) candidates.push(`${stem}.${tld}`);
    }
  }

  return [...new Set(candidates)].slice(0, limit);
}

/**
 * Does this page actually belong to the company? The full name must appear —
 * as words or run together — not merely its first word. "Apex" alone matches a
 * thousand unrelated sites; "Apex Scaffolding" does not.
 */
export function pageNamesCompany(name: string | null, pageText: string): boolean {
  const words = companyWords(name);
  if (words.length === 0) return false;

  const haystack = ` ${pageText.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const spaced = ` ${words.join(' ')} `;
  const joined = ` ${words.join('')} `;

  // A single short word is too common to count as evidence on its own.
  if (words.length === 1 && words[0]!.length < 5) return false;

  return haystack.includes(spaced) || haystack.includes(joined);
}
