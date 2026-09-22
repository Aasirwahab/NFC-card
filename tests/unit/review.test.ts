import { describe, expect, it } from 'vitest';
import type { Brief } from '@/lib/enrich/brief';
import { reviewRepPitch } from '@/lib/enrich/review';

/**
 * The rep's own edit (§14.5): the gate warns, and blocks only on the note.
 */

const brief: Brief = {
  revision: 1,
  prospect: { firstName: 'Tom', company: 'BuildRite Plant' },
  problems: ['Idle machine tracking'],
  primaryProblem: 'Idle machine tracking',
  customProblem: null,
  niche: 'plant hire',
  toneNote: 'Arsenal fan, two kids',
  rep: { firstName: 'Zaid', fullName: 'Zaid Hameer', title: 'Founder' },
  business: {
    name: 'TMA',
    tagline: null,
    services: ['Plant hire automation'],
    pricing: null,
    knowledge: '',
  },
  facts: [],
  eventName: 'Plant Hire Expo',
  cta: 'Book 15 minutes on idle machine tracking',
};

describe('reviewRepPitch', () => {
  it('lets a short, rough edit through with warnings rather than blocking it', () => {
    const review = reviewRepPitch('Quick one on idle machine tracking — grab a time.', brief);
    expect(review.blocked).toEqual([]);
    expect(review.warnings.map((w) => w.check)).toContain('length');
  });

  it('blocks an edit that repeats the private note', () => {
    const review = reviewRepPitch(
      'Great chatting about idle machine tracking, and about Arsenal. Book a time below.',
      brief,
    );
    expect(review.blocked.map((f) => f.check)).toEqual(['echoes_note']);
  });

  it('blocks an empty edit', () => {
    expect(reviewRepPitch('   ', brief).blocked.map((f) => f.check)).toEqual(['empty']);
  });

  it('warns, but does not block, on a price the brief does not contain', () => {
    const review = reviewRepPitch(
      'On idle machine tracking: our setup is £400 a month. Book 15 minutes below. — Zaid',
      brief,
    );
    expect(review.blocked).toEqual([]);
    expect(review.warnings.map((w) => w.check)).toContain('unsupported_price');
  });
});
