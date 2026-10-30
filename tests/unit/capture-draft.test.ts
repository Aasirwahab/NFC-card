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
  };

  it('keeps the form fields across JSON storage', () => {
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

import { visibleChips } from '@/lib/capture/chips';

describe('long chip lists', () => {
  const all = Array.from({ length: 20 }, (_, i) => `p${i}`);

  it('shows eight, hides the rest, and says how many', () => {
    const v = visibleChips(all, [], false);
    expect(v.shown).toHaveLength(8);
    expect(v.hiddenCount).toBe(12);
  });

  it('keeps a ticked chip on screen even when it is deep in the list', () => {
    const v = visibleChips(all, ['p19'], false);
    expect(v.shown.slice(0, 8)).toEqual(all.slice(0, 8));
    expect(v.shown).toContain('p19');
    expect(v.hiddenCount).toBe(11);
  });

  it('shows everything when expanded', () => {
    expect(visibleChips(all, ['p3'], true)).toEqual({ shown: all, hiddenCount: 0 });
  });
});
