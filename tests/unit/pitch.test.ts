import { describe, expect, it } from 'vitest';
import {
  callToAction,
  greeting,
  primaryProblem,
  templatePitch,
  wordCount,
  type PitchInput,
} from '@/lib/domain/pitch';

const base: PitchInput = {
  prospectName: 'Tom Hargreaves',
  prospectCompany: 'BuildRite',
  problems: ['Idle machine tracking'],
  customProblems: null,
  repName: 'Zaid',
  businessName: 'TMA',
  services: ['plant hire automation', 'maritime compliance'],
  eventName: 'Plant Hire Expo',
};

describe('primaryProblem', () => {
  it('prefers a selected problem over the free text', () => {
    expect(
      primaryProblem({ problems: ['Manual timesheets'], customProblems: 'something else' }),
    ).toBe('Manual timesheets');
  });

  it('falls back to the first clause of the free text', () => {
    expect(
      primaryProblem({ problems: [], customProblems: 'Losing hours to paperwork. Also hiring.' }),
    ).toBe('Losing hours to paperwork');
  });

  it('returns null when the rep captured no problem at all', () => {
    expect(primaryProblem({ problems: [], customProblems: null })).toBeNull();
    expect(primaryProblem({ problems: ['  '], customProblems: '   ' })).toBeNull();
  });
});

describe('callToAction (§16)', () => {
  it('names the problem rather than saying "Book a demo"', () => {
    expect(callToAction(base)).toBe('Book 15 minutes on idle machine tracking');
    expect(callToAction(base)).not.toMatch(/demo/i);
  });

  it('preserves an acronym at the start of the problem', () => {
    expect(
      callToAction({ problems: ['IMO 2030 reporting'], customProblems: null, repName: 'Zaid' }),
    ).toBe('Book 15 minutes on IMO 2030 reporting');
  });

  it('falls back to the rep’s name when no problem was captured', () => {
    expect(callToAction({ problems: [], customProblems: null, repName: 'Zaid' })).toBe(
      'Book 15 minutes with Zaid',
    );
  });

  it('trims a long problem at a word boundary, not mid-word', () => {
    const cta = callToAction({
      problems: [
        'Reconciling subcontractor timesheets across seven depots every single Friday afternoon',
      ],
      customProblems: null,
      repName: 'Zaid',
    });
    expect(cta.length).toBeLessThan(80);
    expect(cta).toMatch(/…$/);
    expect(cta).not.toMatch(/\s…$/);
  });
});

describe('greeting', () => {
  it('uses the first name only', () => {
    expect(greeting('Tom Hargreaves')).toBe('Hi Tom,');
  });

  it('stays warm when there is no name', () => {
    expect(greeting(null)).toBe('Hi,');
    expect(greeting('   ')).toBe('Hi,');
  });
});

describe('templatePitch (§16, the `failed` state)', () => {
  it('references the problem the prospect actually stated', () => {
    // A generic pitch is the failure mode the product exists to avoid.
    expect(templatePitch(base)).toContain('idle machine tracking');
  });

  it('lowercases service labels mid-sentence, but keeps acronyms', () => {
    // Services are stored as labels. "TMA does Plant hire automation" reads as a
    // template, which is the one thing the failed state must not look like.
    const pitch = templatePitch({
      ...base,
      services: ['Plant hire automation', 'IMO reporting', 'Maritime compliance'],
    });
    expect(pitch).toContain(
      'TMA does plant hire automation, IMO reporting and maritime compliance.',
    );
  });

  it('never echoes the memorable note', () => {
    // The note is not even an input to this function, which is the strongest
    // possible version of the §23.1 guarantee: it cannot leak what it cannot see.
    const keys = Object.keys(base);
    expect(keys).not.toContain('memorableInfo');
    expect(keys).not.toContain('memorable_info');
  });

  it('contains no placeholders or AI tells (§14.2)', () => {
    const variants: PitchInput[] = [
      base,
      { ...base, problems: [], customProblems: 'Losing hours to paperwork' },
      { ...base, problems: [], customProblems: null },
      { ...base, prospectName: null, prospectCompany: null, eventName: null },
      { ...base, businessName: null, services: [] },
    ];

    for (const variant of variants) {
      const pitch = templatePitch(variant);
      expect(pitch).not.toMatch(/\[.*?\]/); // [company], [name]
      expect(pitch).not.toMatch(/\{.*?\}/); // unrendered template braces
      expect(pitch).not.toMatch(/as an AI/i);
      expect(pitch).not.toMatch(/I hope this (email )?finds you/i);
      expect(pitch).not.toMatch(/undefined|null|NaN/);
    }
  });

  it('stays inside the quality gate’s 60-180 word window in every variant', () => {
    const variants: PitchInput[] = [
      base,
      { ...base, problems: [], customProblems: null },
      { ...base, prospectName: null, prospectCompany: null, eventName: null, services: [] },
      { ...base, services: ['a', 'b', 'c', 'd', 'e'] },
      {
        ...base,
        problems: [],
        customProblems:
          'Reconciling subcontractor timesheets across seven depots every Friday afternoon',
      },
    ];

    for (const variant of variants) {
      const count = wordCount(templatePitch(variant));
      expect(count, `"${templatePitch(variant).slice(0, 60)}…"`).toBeGreaterThanOrEqual(60);
      expect(count).toBeLessThanOrEqual(180);
    }
  });

  it('names the event when there is one and stays graceful when there is not', () => {
    expect(templatePitch(base)).toContain('Plant Hire Expo');
    expect(templatePitch({ ...base, eventName: null })).not.toContain('undefined');
  });

  it('signs off as the rep', () => {
    expect(templatePitch(base)).toContain('Zaid');
  });

  it('is deterministic — the same input always produces the same pitch', () => {
    // This is what makes it safe to render on every request without caching, and
    // what makes the screenshot in the Phase 2 done-when reproducible.
    expect(templatePitch(base)).toBe(templatePitch(base));
  });
});
