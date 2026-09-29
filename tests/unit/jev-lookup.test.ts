import { describe, expect, it } from 'vitest';
import { assertNoPersonalFields, createJev, type JevClient } from '@/lib/jev/client';
import { findCompanySite } from '@/lib/lookup/company';
import {
  findLinkedInProfile,
  nameRelation,
  profileUrl,
  splitHeadline,
} from '@/lib/lookup/linkedin';
import type { SearchFn } from '@/lib/search/types';

// ------------------------------------------------------------- the client

describe('createJev', () => {
  it('returns the yes probability and sends a typed question', async () => {
    let sent: Record<string, unknown> = {};
    const jev = createJev(
      async (body) => {
        sent = body;
        return { answers: { answer: { noul: 0.83 } } };
      },
      { model: 'typesafe/jev-1.13' },
    );
    expect(await jev.yes({ state: 'a business', question: 'Is it?' })).toBe(0.83);
    expect(sent).toMatchObject({
      model: 'typesafe/jev-1.13',
      questions: { answer: { type: 'noul' } },
    });
  });

  it('turns every failure and every odd answer into null', async () => {
    const boom = createJev(async () => Promise.reject(new Error('down')), { model: 'm' });
    expect(await boom.yes({ state: 's', question: 'q' })).toBeNull();
    expect(await boom.pick({ state: 's', question: 'q', options: { a: 'x', b: 'y' } })).toBeNull();

    const odd = createJev(async () => ({ answers: { answer: { noul: 7 } } }), { model: 'm' });
    expect(await odd.yes({ state: 's', question: 'q' })).toBeNull();
    const unknownChoice = createJev(
      async () => ({ answers: { answer: { choice: 'zzz', confidence: 0.9, probabilities: {} } } }),
      { model: 'm' },
    );
    expect(
      await unknownChoice.pick({ state: 's', question: 'q', options: { a: 'x', b: 'y' } }),
    ).toBeNull();
  });

  it('refuses a state that carries an email address or phone number', () => {
    expect(() => assertNoPersonalFields('mail sarah@whitlock.example')).toThrow();
    expect(() => assertNoPersonalFields('call +44 7700 900123')).toThrow();
    expect(() => assertNoPersonalFields('Whitlock Homes, Manchester')).not.toThrow();
  });
});

// ------------------------------------------------------------ company site

const fakePick = (
  choice: string,
  confidence: number,
  probabilities: Record<string, number>,
): JevClient => ({
  yes: async () => null,
  pick: async () => ({ choice, confidence, probabilities }) as never,
});

const results =
  (...rows: [string, string][]): SearchFn =>
  async () =>
    rows.map(([url, title]) => ({ url, title, snippet: `${title} snippet` }));

describe('findCompanySite', () => {
  const search = results(
    ['https://www.linkedin.com/company/northgate', 'Northgate Logistics | LinkedIn'],
    ['https://companies-list.example/northgate', 'Northgate Logistics Ltd - company profile'],
    ['https://northgatelogistics.example/', 'Northgate Logistics | Freight forwarding in Leeds'],
    ['https://northgate-group.example/', 'Northgate Group | Care homes'],
  );

  it('drops social profiles, lets Jev pick, and marks the likely site', async () => {
    const lookup = await findCompanySite({
      search,
      // c1 = companies-list, c2 = northgatelogistics, c3 = northgate-group
      jev: fakePick('c2', 0.92, { c1: 0.05, c2: 0.92, c3: 0.03 }),
      name: 'Northgate Logistics',
      place: 'Leeds',
    });
    expect(lookup.candidates.map((c) => c.domain)).toEqual([
      'northgatelogistics.example',
      'companies-list.example',
      'northgate-group.example',
    ]);
    expect(lookup.likelyUrl).toBe('https://northgatelogistics.example/');
  });

  it('claims nothing when Jev is unsure, says other, or is unavailable', async () => {
    for (const jev of [
      fakePick('c2', 0.5, { c2: 0.5 }),
      fakePick('other', 0.95, { other: 0.95 }),
      null,
    ]) {
      const lookup = await findCompanySite({ search, jev, name: 'Northgate Logistics' });
      expect(lookup.likelyUrl).toBeNull();
      expect(lookup.candidates.length).toBeGreaterThan(0);
    }
  });

  it('returns nothing when the search returns nothing', async () => {
    const lookup = await findCompanySite({ search: async () => [], jev: null, name: 'Zzz' });
    expect(lookup).toEqual({ candidates: [], likelyUrl: null });
  });
});

// ------------------------------------------------------------- LinkedIn

describe('names', () => {
  it('compares names in plain code, with common short forms', () => {
    expect(nameRelation('Sarah Whitlock', 'Sarah Whitlock')).toBe('same');
    expect(nameRelation('Rob Williams', 'Robert Williams')).toBe('alias');
    expect(nameRelation('Sarah Whitlock', 'Sarah Whitlock-Jones')).toBe('different');
    expect(nameRelation('Sarah Whitlock', 'Tony Whitlock')).toBe('different');
    expect(nameRelation('Sarah', 'Sarah Whitlock')).toBe('different');
    expect(nameRelation('Dr Sarah Whitlock MRICS', 'Sarah Whitlock')).toBe('same');
  });

  it('only accepts a person profile link and canonicalises it', () => {
    expect(profileUrl('https://uk.linkedin.com/in/sarah-w-123?trk=x')).toBe(
      'https://www.linkedin.com/in/sarah-w-123',
    );
    expect(profileUrl('https://www.linkedin.com/company/acme')).toBeNull();
    expect(profileUrl('https://evil.example/in/sarah')).toBeNull();
  });

  it('splits a headline', () => {
    expect(splitHeadline('Sarah Whitlock - Director - Whitlock Homes | LinkedIn')).toEqual({
      name: 'Sarah Whitlock',
      rest: 'Director - Whitlock Homes',
    });
  });
});

/** A judge that answers from the text it is shown: same_company if it names Whitlock Homes. */
const textJudge = (log: string[] = []): JevClient => ({
  yes: async () => null,
  pick: async ({ state }) => {
    log.push(state);
    const same = /whitlock homes/i.test(state.split('Text from')[1] ?? '');
    const similar = /whitlock consulting/i.test(state);
    const none = /\(nothing\)|Professional profile/i.test(state);
    const choice = same
      ? 'same_company'
      : similar
        ? 'similar_name_different_company'
        : none
          ? 'not_stated'
          : 'different_company';
    return {
      choice,
      confidence: 0.9,
      probabilities: { [choice]: 0.9, ...(same ? {} : { same_company: 0.05 }) },
    } as never;
  },
});

const li =
  (...rows: [string, string, string?][]): SearchFn =>
  async () =>
    rows.map(([slug, title, snippet]) => ({
      url: `https://uk.linkedin.com/in/${slug}`,
      title,
      snippet: snippet ?? '',
    }));

describe('findLinkedInProfile', () => {
  it('recommends the one exact match and ranks the rest below it', async () => {
    const log: string[] = [];
    const lookup = await findLinkedInProfile({
      search: li(
        ['sarah-w-9', 'Sarah Whitlock - Consultant - Whitlock Consulting | LinkedIn'],
        ['sarah-whitlock-1', 'Sarah Whitlock - Director - Whitlock Homes | LinkedIn', 'Manchester'],
        ['tony-w', 'Tony Whitlock - Director - Whitlock Homes | LinkedIn'],
      ),
      jev: textJudge(log),
      name: 'Sarah Whitlock',
      company: 'Whitlock Homes',
    });
    expect(lookup.candidates.map((c) => [c.url.split('/in/')[1], c.label])).toEqual([
      ['sarah-whitlock-1', 'exact_match'],
      ['sarah-w-9', 'namesake'],
      ['tony-w', 'colleague'],
    ]);
    expect(lookup.likelyUrl).toBe('https://www.linkedin.com/in/sarah-whitlock-1');
    // The judge is only ever shown the employer text: never the person's name.
    expect(log.length).toBe(3);
    expect(log.join(' ')).not.toMatch(/Sarah|Tony/);
  });

  it('recommends nothing when two people of that name work at the company', async () => {
    const lookup = await findLinkedInProfile({
      search: li(
        ['s1', 'Sarah Whitlock - Director - Whitlock Homes | LinkedIn'],
        ['s2', 'Sarah Whitlock - Head of Sales - Whitlock Homes | LinkedIn'],
      ),
      jev: textJudge(),
      name: 'Sarah Whitlock',
      company: 'Whitlock Homes',
    });
    expect(lookup.candidates.filter((c) => c.label === 'exact_match')).toHaveLength(2);
    expect(lookup.likelyUrl).toBeNull();
  });

  it('marks a bare profile as ambiguous, never likely', async () => {
    const lookup = await findLinkedInProfile({
      search: li(['s1', 'Sarah Whitlock | LinkedIn', 'Professional profile. United Kingdom.']),
      jev: textJudge(),
      name: 'Sarah Whitlock',
      company: 'Whitlock Homes',
    });
    expect(lookup.candidates[0]!.label).toBe('ambiguous');
    expect(lookup.likelyUrl).toBeNull();
  });

  it('does not call a former employee a likely match', async () => {
    const lookup = await findLinkedInProfile({
      search: li([
        'tb',
        'Tom Bexley - Former Director - Bexley & Sons | LinkedIn',
        'Now a consultant.',
      ]),
      jev: textJudge(),
      name: 'Tom Bexley',
      company: 'Bexley & Sons',
    });
    expect(lookup.candidates[0]!.label).toBe('ambiguous');
    expect(lookup.likelyUrl).toBeNull();
  });

  it('never returns a company page or a non-LinkedIn link', async () => {
    const lookup = await findLinkedInProfile({
      search: async () => [
        {
          url: 'https://www.linkedin.com/company/whitlock',
          title: 'Whitlock Homes | LinkedIn',
          snippet: '',
        },
        { url: 'https://evil.example/in/sarah', title: 'Sarah Whitlock', snippet: '' },
      ],
      jev: null,
      name: 'Sarah Whitlock',
      company: 'Whitlock Homes',
    });
    expect(lookup.candidates).toEqual([]);
  });

  it('still works without Jev (text match only) and still never over-claims a tie', async () => {
    const lookup = await findLinkedInProfile({
      search: li(['s1', 'Sarah Whitlock - Director - Whitlock Homes | LinkedIn']),
      jev: null,
      name: 'Sarah Whitlock',
      company: 'Whitlock Homes',
    });
    expect(lookup.candidates[0]!.label).toBe('exact_match');
    // Without Jev the evidence is only a substring, so the score stays under the bar.
    expect(lookup.likelyUrl).toBeNull();
  });
});
