import { describe, expect, it } from 'vitest';
import type { JevClient } from '@/lib/jev/client';
import { findLinkedInProfile, nameRelation, searchCompany } from '@/lib/lookup/linkedin';
import type { SearchFn, SearchResult } from '@/lib/search/types';

/**
 * Recall of the LinkedIn lookup against a small fake "Google": a result is returned only
 * when every quoted phrase of the query appears in its title or snippet, like the real
 * thing. Titles copy LinkedIn's real shape: "Name - Role - Company | LinkedIn".
 */
const CORPUS: SearchResult[] = [
  p(
    'zaidh-zameer-1',
    'Zaidh Zameer - Founder - Webvoxel | LinkedIn',
    'Founder at Webvoxel. London.',
  ),
  p(
    'sarah-jones-22',
    'Sarah Jones, CPA - Finance Director - Northgate Group | LinkedIn',
    'Finance Director at Northgate Group.',
  ),
  p('sarah-jones-77', 'Sarah Jones - Nurse - NHS | LinkedIn', 'Nurse at NHS. Leeds.'),
  p(
    'robert-clarke-5',
    'Robert Clarke - Owner - Clarke & Sons Plumbing | LinkedIn',
    'Owner at Clarke & Sons Plumbing.',
  ),
  p(
    'jean-luc-martin-9',
    'Jean-Luc Martin - Director - Bluewave Logistics Ltd | LinkedIn',
    'Director at Bluewave Logistics.',
  ),
  p(
    'maria-garcia-lopez-3',
    'María García López - Head of Sales - Solis Energy | LinkedIn',
    'Head of Sales at Solis Energy.',
  ),
  p(
    'david-o-neill-4',
    "David O'Neill - Managing Director - Harbour Estates | LinkedIn",
    'MD at Harbour Estates.',
  ),
  p(
    'priya-patel-8',
    'Priya Patel, MSc, PMP - Operations Manager - Tidal Foods | LinkedIn',
    'Operations Manager at Tidal Foods.',
  ),
  p(
    'tom-hughes-6',
    'Thomas Hughes - Partner - Hughes Legal LLP | LinkedIn',
    'Partner at Hughes Legal LLP.',
  ),
  p(
    'aisha-khan-2',
    'Aisha Khan - Co-founder - Brightside Clinics | LinkedIn',
    'Co-founder at Brightside Clinics.',
  ),
];

function p(slug: string, title: string, snippet: string): SearchResult {
  return { url: `https://uk.linkedin.com/in/${slug}`, title, snippet };
}

const fold = (t: string) =>
  t.replace(/['-]/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Quoted phrases must match; loose words only need to match one (Google's fuzzy side).
const search: SearchFn = async (query) => {
  const quoted = [...query.matchAll(/"([^"]+)"/g)].map((m) => fold(m[1]!));
  const loose = fold(query.replace(/"[^"]+"/g, ' ').replace(/site:\S+|linkedin/gi, ' '))
    .split(/\s+/)
    .filter(Boolean);
  return CORPUS.filter((r) => {
    const text = fold(`${r.title} ${r.snippet}`);
    return (
      quoted.every((q) => text.includes(q)) &&
      (loose.length === 0 || loose.some((w) => text.includes(w)))
    );
  });
};

// A stand-in for Jev: same company when the employer text contains the typed company's first word.
const jev: JevClient = {
  yes: async () => null,
  pick: async ({ state }) => {
    const m = state.match(/Target company: (.+?)\. Text from/);
    const text = fold(state);
    const first = fold(m?.[1] ?? '').split(/\s+/)[0] ?? '';
    const same = first.length > 2 && text.split('text from')[1]?.includes(first);
    return {
      choice: same ? 'same_company' : 'not_stated',
      probabilities: { same_company: same ? 0.9 : 0.1 },
    } as never;
  },
};

const run = (name: string, company: string | null) =>
  findLinkedInProfile({ search, jev, name, company });

describe('LinkedIn lookup recall', () => {
  const cases: [string, string, string | null, string][] = [
    ['exact name and company', 'Zaidh Zameer', 'Webvoxel', 'zaidh-zameer-1'],
    ['name spelt one letter off', 'Zaid Zameer', 'Webvoxel', 'zaidh-zameer-1'],
    [
      'company typed with Ltd',
      'Jean-Luc Martin',
      'Bluewave Logistics Limited',
      'jean-luc-martin-9',
    ],
    ['credential after the name', 'Sarah Jones', 'Northgate Group', 'sarah-jones-22'],
    ['several credentials', 'Priya Patel', 'Tidal Foods', 'priya-patel-8'],
    ['accents typed plain', 'Maria Garcia Lopez', 'Solis Energy', 'maria-garcia-lopez-3'],
    ['apostrophe surname', 'David ONeill', 'Harbour Estates', 'david-o-neill-4'],
    ['nickname for first name', 'Tom Hughes', 'Hughes Legal', 'tom-hughes-6'],
    ['company misspelt', 'Aisha Khan', 'Brightside Clinic', 'aisha-khan-2'],
    [
      'company not on the profile',
      'Robert Clarke',
      'Clarke Plumbing and Heating',
      'robert-clarke-5',
    ],
    ['no company typed', 'Aisha Khan', null, 'aisha-khan-2'],
  ];

  for (const [label, name, company, slug] of cases) {
    it(`finds the profile: ${label}`, async () => {
      const found = await run(name, company);
      const hit = found.candidates.find((c) => c.url === `https://www.linkedin.com/in/${slug}`);
      expect(hit).toBeDefined();
      // Found AND judged a possible match, not filed as someone unrelated.
      expect(['unrelated', 'colleague']).not.toContain(hit!.label);
    });
  }

  it('drops a web suffix and a legal suffix from the company', () => {
    expect(searchCompany('Webvoxel.com')).toBe('Webvoxel');
    expect(searchCompany('Hughes Legal Ltd.')).toBe('Hughes Legal');
    expect(searchCompany('Brightside.co.uk')).toBe('Brightside');
    expect(searchCompany('.com')).toBe('.com');
  });

  it('keeps a lone namesake from being recommended', async () => {
    const found = await run('Sarah Jones', null);
    expect(found.likelyUrl).toBeNull();
  });

  it('does not recommend a different person with a one-letter-different name', async () => {
    expect(nameRelation('Sam Jones', 'Sarah Jones')).toBe('different');
    expect(nameRelation('Dan Clarke', 'Dana Clarke')).toBe('different');
    expect(nameRelation('Zaid Zameer', 'Zaidh Zameer')).toBe('close');
  });
});
