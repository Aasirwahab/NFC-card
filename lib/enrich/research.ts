import { z } from 'zod';

/**
 * Step 3: structured signals about the prospect's company (§14).
 *
 * The model is asked for facts WITH a verbatim supporting quote from the site,
 * and every quote is then checked against the text actually fetched. A fact
 * whose quote is not really on the page is dropped. That single deterministic
 * check does two jobs:
 *
 *   - it stops the model inventing facts about the prospect's company, which
 *     the prospect would spot immediately; and
 *   - it blunts prompt injection (§22.5). Text planted on a page to steer the
 *     model can at worst become a "fact" that the page itself contains — it can
 *     never manufacture a claim the page does not make.
 *
 * Only company-level public facts belong here — no prospect details go in or come
 * out — which is what makes the result safe to cache and share across every
 * prospect from that company (§14.1).
 */

export const researchOutputSchema = z.object({
  summary: z
    .string()
    .max(400)
    .nullable()
    .describe('One sentence on what the company does, or null if the text does not say.'),
  facts: z
    .array(
      z.object({
        fact: z.string().max(300).describe('A specific, concrete, public fact about the company.'),
        quote: z
          .string()
          .max(400)
          .describe(
            'The exact words from the website text that support the fact, copied verbatim.',
          ),
      }),
    )
    .max(6),
});

export type ResearchOutput = z.infer<typeof researchOutputSchema>;

/** What step 3 checkpoints and the commit stores in sessions.research. */
export type Research = {
  domain: string | null;
  /** 'website' = typed or confirmed by the rep; 'guess' = unconfirmed, never shown. */
  domainSource: 'website' | 'email' | 'guess' | null;
  pages: string[];
  summary: string | null;
  /** Verified facts only. */
  facts: string[];
  model: string | null;
};

export const EMPTY_RESEARCH: Research = {
  domain: null,
  domainSource: null,
  pages: [],
  summary: null,
  facts: [],
  model: null,
};

const MAX_FACTS = 4;
const MIN_QUOTE = 12;

/** Lower-cased, whitespace-collapsed, typographic quotes and dashes flattened. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—‒―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Keeps only facts whose quote genuinely appears in the fetched text. */
export function verifyFacts(output: ResearchOutput, siteText: string): string[] {
  const haystack = normalise(siteText);
  const kept: string[] = [];
  const seen = new Set<string>();

  for (const { fact, quote } of output.facts) {
    const needle = normalise(quote);
    const claim = fact.trim();
    if (needle.length < MIN_QUOTE || !haystack.includes(needle)) continue;
    if (!claim || seen.has(claim.toLowerCase())) continue;

    seen.add(claim.toLowerCase());
    kept.push(claim);
    if (kept.length === MAX_FACTS) break;
  }

  return kept;
}
