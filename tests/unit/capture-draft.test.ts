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
