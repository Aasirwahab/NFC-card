import { describe, expect, it } from 'vitest';
import { serializeCaptureDraft } from '@/lib/capture/draft';

describe('capture drafts', () => {
  const draft = {
    name: 'Sarah Whitlock',
    company: 'Whitlock Homes',
    website: '',
    email: '',
    phone: '',
    linkedin: '',
    niche: 'Property developers',
    problems: ['Deals stall waiting on funding'],
    customProblems: '',
    line: 'Waiting on funding — follow up next week',
  };

  it('keeps the quick note alongside the form fields across JSON storage', () => {
    const before = Date.now();
    const stored = JSON.parse(serializeCaptureDraft(draft));

    expect(stored).toEqual({ ...draft, savedAt: expect.any(Number) });
    expect(stored.savedAt).toBeGreaterThanOrEqual(before);
    expect(stored.savedAt).toBeLessThanOrEqual(Date.now());
  });

  it('excludes private notes and any other fields from local storage', () => {
    const withPrivateNote = { ...draft, memorable: 'Private', memorable_info: 'Private' };
    const stored = JSON.parse(serializeCaptureDraft(withPrivateNote));

    expect(stored).not.toHaveProperty('memorable');
    expect(stored).not.toHaveProperty('memorable_info');
  });

  it('keeps an empty line after the quick note is used or cleared', () => {
    const stored = JSON.parse(serializeCaptureDraft({ ...draft, line: '' }));

    expect(stored.line).toBe('');
  });
});

import { chipProblemsForAll, joinNiches, parseNicheList } from '@/lib/capture/chips';

describe('several areas at once', () => {
  const niches = [
    { name: 'Clinics', problems: ['Missed calls', 'No-shows'] },
    { name: 'Trades', problems: ['Missed calls', 'Slow quotes'] },
  ];

  it('shows each problem once across every ticked area', () => {
    expect(chipProblemsForAll(niches, ['Clinics', 'Trades'], [])).toEqual([
      'Missed calls',
      'No-shows',
      'Slow quotes',
    ]);
  });

  it('round-trips the ticked areas through the single niche column', () => {
    const stored = joinNiches(['Clinics', 'Trades']);
    expect(parseNicheList(stored, niches)).toEqual(['Clinics', 'Trades']);
  });

  it('starts on the first area, and drops an area that no longer exists', () => {
    expect(parseNicheList(null, niches)).toEqual(['Clinics']);
    expect(parseNicheList('Gone | Trades', niches)).toEqual(['Trades']);
  });

  it('falls back to the playbook when nothing is ticked and the event has no problems', () => {
    expect(chipProblemsForAll([{ name: 'A', problems: [] }], [], ['Common one'])).toEqual([
      'Common one',
    ]);
  });
});
