import type { JevClient } from '@/lib/jev/client';
import type { SearchFn } from '@/lib/search/types';

/**
 * "Which LinkedIn profile is theirs?" Search-result text only: we NEVER load
 * LinkedIn (lib/http/safe-fetch refuses it). The rep taps the right candidate and
 * we keep only that link; nothing below is stored.
 *
 * The person's NAME is compared here in plain code and blanked out before Jev sees
 * the result, so the decision model only judges whether the employer text matches
 * the company (business-level text). PURE apart from the injected search and Jev.
 */

export type ProfileLabel = 'exact_match' | 'colleague' | 'namesake' | 'ambiguous' | 'unrelated';
export type NameRelation = 'same' | 'alias' | 'different';
type CompanyRelation =
  'same_company' | 'similar_name_different_company' | 'different_company' | 'not_stated';

export type ProfileCandidate = {
  url: string;
  headline: string;
  snippet: string;
  label: ProfileLabel;
  /** 0 to 1, for ordering only. */
  score: number;
};

export type ProfileLookup = { candidates: ProfileCandidate[]; likelyUrl: string | null };

// ---------------------------------------------------------------- names

const ALIASES: readonly (readonly string[])[] = [
  ['robert', 'rob', 'bob', 'bobby', 'robbie'],
  ['william', 'will', 'bill', 'billy'],
  ['richard', 'rich', 'rick', 'dick', 'richie'],
  ['james', 'jim', 'jimmy', 'jamie'],
  ['john', 'jon', 'johnny', 'jack'],
  ['michael', 'mike', 'mick', 'mikey'],
  ['thomas', 'tom', 'tommy'],
  ['christopher', 'chris'],
  ['elizabeth', 'liz', 'beth', 'lizzie', 'eliza'],
  ['katherine', 'catherine', 'kate', 'katie', 'kath'],
  ['margaret', 'maggie', 'meg', 'peggy'],
  ['alexander', 'alex', 'sandy'],
  ['alexandra', 'alex', 'sandra'],
  ['samuel', 'sam'],
  ['daniel', 'dan', 'danny'],
  ['matthew', 'matt'],
  ['andrew', 'andy', 'drew'],
  ['nicholas', 'nick'],
  ['jonathan', 'jon'],
  ['stephen', 'steven', 'steve'],
  ['edward', 'ed', 'eddie', 'ted'],
  ['benjamin', 'ben'],
  ['joseph', 'joe'],
  ['jennifer', 'jen', 'jenny'],
  ['rebecca', 'becky', 'becca'],
  ['victoria', 'vicky', 'tori'],
];

export function normaliseName(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ''))
    .filter(
      (t) =>
        t.length > 0 &&
        !['mr', 'mrs', 'ms', 'dr', 'prof', 'sir', 'mba', 'cfa', 'frics', 'mrics', 'phd'].includes(
          t,
        ),
    );
}

function sameFirst(a: string, b: string): 'same' | 'alias' | 'different' {
  if (a === b) return 'same';
  return ALIASES.some((group) => group.includes(a) && group.includes(b)) ? 'alias' : 'different';
}

/** How the typed name relates to the name at the start of a result title. Deterministic. */
export function nameRelation(typed: string, candidateName: string): NameRelation {
  const t = normaliseName(typed);
  const c = normaliseName(candidateName);
  if (t.length === 0 || c.length === 0) return 'different';
  const tFirst = t[0]!;
  const tLast = t[t.length - 1]!;
  const cFirst = c[0]!;
  const cLast = c[c.length - 1]!;
  if (t.length === 1 || c.length === 1) return 'different'; // a lone name is never enough
  if (tLast !== cLast) return 'different';
  return sameFirst(tFirst, cFirst) === 'same'
    ? 'same'
    : sameFirst(tFirst, cFirst) === 'alias'
      ? 'alias'
      : 'different';
}

// -------------------------------------------------------------- results

/** Canonical form of a profile link; null for anything that is not a person's profile. */
export function profileUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/in\/([^/?#]+)/i);
    return m ? `https://www.linkedin.com/in/${m[1]}` : null;
  } catch {
    return null;
  }
}

/** "Name - Role - Company | LinkedIn" -> the pieces. */
export function splitHeadline(title: string): { name: string; rest: string } {
  const cleaned = title.replace(/\s*[|·]\s*LinkedIn.*$/i, '').trim();
  const [first, ...rest] = cleaned.split(/\s+(?:[-–—]|\|)\s+/);
  return { name: (first ?? '').trim(), rest: rest.join(' - ').trim() };
}

const MAX_CANDIDATES = 5;
export const LIKELY_MIN = 0.7;

/** Text going inside a quoted search phrase: no quotes, operators or line breaks. */
export function phrase(text: string): string {
  return text
    .replace(/["\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export async function findLinkedInProfile(input: {
  search: SearchFn;
  jev: JevClient | null;
  name: string;
  company?: string | null;
}): Promise<ProfileLookup> {
  const company = input.company?.trim() || null;
  // Two shapes, measured on 8 well-known people (2026-09-29): the plain phrase query
  // found more profiles than the site: operator, which returned lookalikes and
  // colleagues. Try the plain one; only if it yields no profile at all, the site: one.
  const plain = `"${phrase(input.name)}"${company ? ` "${phrase(company)}"` : ''} LinkedIn`;
  const scoped = `site:linkedin.com/in "${phrase(input.name)}"${company ? ` "${phrase(company)}"` : ''}`;
  // Both searches start together, but the answer waits only as long as it must: the
  // plain one usually finds a profile, and the slower scoped one is then ignored.
  const plainPending = input.search(plain, { count: 10 });
  const scopedPending = input.search(scoped, { count: 10 });
  scopedPending.catch(() => undefined);
  const plainResults = await plainPending;
  const results = plainResults.some((r) => profileUrl(r.url)) ? plainResults : await scopedPending;

  const seen = new Set<string>();
  const parsed: {
    url: string;
    headline: string;
    snippet: string;
    relation: NameRelation;
    rest: string;
    candidateName: string;
  }[] = [];
  for (const r of results) {
    const url = profileUrl(r.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const { name, rest } = splitHeadline(r.title);
    parsed.push({
      url,
      headline: r.title,
      snippet: r.snippet,
      relation: nameRelation(input.name, name),
      rest,
      candidateName: name,
    });
    if (parsed.length === MAX_CANDIDATES) break;
  }

  const candidates = await Promise.all(
    parsed.map(async (p): Promise<ProfileCandidate> => {
      const company$ = await companyRelation(input.jev, company, p.rest, p.snippet, [
        input.name,
        p.candidateName,
      ]);
      const { label, score } = classify(p.relation, company$);
      return { url: p.url, headline: p.headline, snippet: p.snippet, label, score };
    }),
  );

  candidates.sort((a, b) => b.score - a.score);

  const exact = candidates.filter((c) => c.label === 'exact_match' && c.score >= LIKELY_MIN);
  // Two strong matches (a big company with two people of that name) is a tie: recommend nothing.
  const likely =
    exact.length === 1 && candidates.filter((c) => c.label === 'exact_match').length === 1
      ? exact[0]!
      : null;
  return { candidates, likelyUrl: likely?.url ?? null };
}

// ------------------------------------------------------------ judgement

const PAST_ROLE = /\b(former|formerly|ex-|previously|past|retired|until \d{4})\b/i;

const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Blank the given people out of a text (case-insensitive): each full name as a
 * phrase, and each first name on its own. A surname ALONE is left, because it is
 * often part of the company ("Whitlock Homes") and blanking it would destroy the
 * very evidence Jev is asked to judge. PURE; exported for tests.
 */
export function redactNames(rawText: string, rawNames: string[]): string {
  // Accents are dropped from both sides so "René" and "Rene" are the same person.
  const flat = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const text = flat(rawText);
  const names = rawNames.map(flat);
  const phrases = names.map((n) => n.replace(/\s+/g, ' ').trim()).filter((n) => n.length >= 3);
  const firsts = names
    .map((n) => normaliseName(n)[0])
    .filter((w): w is string => Boolean(w && w.length >= 2));
  let out = text;
  for (const phrase of phrases.sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(escapeRe(phrase), 'gi'), 'PERSON');
  }
  for (const first of new Set(firsts)) {
    out = out.replace(new RegExp(`\\b${escapeRe(first)}\\b`, 'gi'), 'PERSON');
  }
  return out;
}

async function companyRelation(
  jev: JevClient | null,
  company: string | null,
  employerText: string,
  snippet: string,
  names: string[],
): Promise<{ relation: CompanyRelation; sameProbability: number | null }> {
  if (!company) return { relation: 'not_stated', sameProbability: null };
  const text = redactNames(`${employerText}. ${snippet}`.trim(), names);
  // "Former Director at X" is not "works at X": the strongest signal for a likely
  // match must be a CURRENT employer (found in the labelled test: 1 false match).
  if (PAST_ROLE.test(text)) return { relation: 'not_stated', sameProbability: null };
  if (!jev) {
    // No judge: a plain substring test is the only evidence, and it can only say "same".
    return text.toLowerCase().includes(company.toLowerCase())
      ? { relation: 'same_company', sameProbability: 0.6 }
      : { relation: 'not_stated', sameProbability: null };
  }

  const pick = await jev.pick({
    // The person's name is blanked out here on purpose: Jev judges the employer text only.
    state: `Target company: ${company}. Text from a search result about a person (name removed): ${text || '(nothing)'}`,
    question:
      'Does the text say the person works for the target company? Choose same_company only if the employer named is that company; similar_name_different_company if a differently named but similar company is named; different_company if another company is named; not_stated if no employer is named.',
    options: {
      same_company: 'The employer named is the target company',
      similar_name_different_company: 'A similarly named but different company is the employer',
      different_company: 'A clearly different company is the employer',
      not_stated: 'No employer is named',
    },
  });
  if (!pick) return { relation: 'not_stated', sameProbability: null };
  const relation = (pick.choice === 'other' ? 'not_stated' : pick.choice) as CompanyRelation;
  return { relation, sameProbability: pick.probabilities['same_company'] ?? null };
}

function classify(
  name: NameRelation,
  company: { relation: CompanyRelation; sameProbability: number | null },
): { label: ProfileLabel; score: number } {
  const nameOk = name !== 'different';
  const same = company.relation === 'same_company';
  const p = company.sameProbability ?? 0.6;

  if (nameOk && same) return { label: 'exact_match', score: (name === 'same' ? 0.95 : 0.85) * p };
  if (nameOk && company.relation === 'not_stated')
    return { label: 'ambiguous', score: name === 'same' ? 0.4 : 0.3 };
  if (nameOk) return { label: 'namesake', score: 0.1 };
  if (same) return { label: 'colleague', score: 0.05 };
  return { label: 'unrelated', score: 0 };
}
