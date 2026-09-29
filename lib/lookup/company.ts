import type { JevClient } from '@/lib/jev/client';
import type { SearchFn, SearchResult } from '@/lib/search/types';

/**
 * "Which website is theirs?" The rep types the company, we search, Jev judges which
 * result is the official site, and the REP TAPS the answer: this only ever suggests.
 * PURE apart from the injected search and Jev.
 */

/** Social profiles and the like are never a company's own site. */
const NOT_A_SITE =
  /(^|\.)(linkedin|facebook|instagram|twitter|x|tiktok|youtube|pinterest|reddit)\.com$/i;

export type SiteCandidate = {
  url: string;
  domain: string;
  title: string;
  snippet: string;
  /** Jev's probability that this is the official site; null without an opinion. */
  score: number | null;
};

export type SiteLookup = { candidates: SiteCandidate[]; likelyUrl: string | null };

/** Above this, the top candidate is labelled "likely". Set from our own test cases (0.87 to 0.95 when right). */
export const LIKELY_SITE_CONFIDENCE = 0.75;
const MAX_CANDIDATES = 4;

function homepage(result: SearchResult): { url: string; domain: string } | null {
  try {
    const u = new URL(result.url);
    if (u.protocol !== 'https:' || NOT_A_SITE.test(u.hostname)) return null;
    return { url: result.url, domain: u.hostname.replace(/^www\./, '') };
  } catch {
    return null;
  }
}

export async function findCompanySite(input: {
  search: SearchFn;
  jev: JevClient | null;
  name: string;
  place?: string | null;
}): Promise<SiteLookup> {
  const place = input.place?.replace(/["\n\r\t]/g, ' ').trim();
  const name = input.name
    .replace(/["\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 2) return { candidates: [], likelyUrl: null };
  // "<name> company website" put the right site in the top 3 for 9 of 10 companies in a
  // 2026-09-29 test; adding "official website" or the place drove that down to 5 and 2.
  // The place still goes to Jev, which judges the candidates.
  const results = await input.search(`${name} company website`, { count: 10 });

  const seen = new Set<string>();
  const candidates: SiteCandidate[] = [];
  for (const result of results) {
    const site = homepage(result);
    if (!site || seen.has(site.domain)) continue;
    seen.add(site.domain);
    candidates.push({ ...site, title: result.title, snippet: result.snippet, score: null });
    if (candidates.length === MAX_CANDIDATES) break;
  }

  if (candidates.length === 0) return { candidates, likelyUrl: null };
  if (!input.jev || candidates.length === 1) {
    // One result, or no judge: show it, claim nothing.
    return { candidates, likelyUrl: null };
  }

  const options = Object.fromEntries(candidates.map((c, i) => [`c${i + 1}`, c.domain])) as Record<
    string,
    string
  >;
  const state =
    `Business named: ${name}${place ? ` (${place})` : ''}. Candidate search results:\n` +
    candidates.map((c, i) => `${i + 1}. ${c.domain}: ${c.title}. ${c.snippet}`).join('\n');

  const pick = await input.jev.pick({
    state,
    question:
      'Which candidate is the official primary website of the business named above? Answer with its number label. Directory listings, review sites and similarly named businesses are not the official site.',
    options,
  });
  if (!pick) return { candidates, likelyUrl: null };

  const byLabel = new Map<string, SiteCandidate>(candidates.map((c, i) => [`c${i + 1}`, c]));
  for (const [label, c] of byLabel) c.score = pick.probabilities[label] ?? null;
  const chosen = pick.choice === 'other' ? null : (byLabel.get(pick.choice) ?? null);

  candidates.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const likely = chosen && pick.confidence >= LIKELY_SITE_CONFIDENCE ? chosen : null;
  return { candidates, likelyUrl: likely?.url ?? null };
}
