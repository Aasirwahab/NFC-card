import { describe, expect, it } from 'vitest';
import { commonQuestions } from '@/lib/chat/knowledge';

describe('commonQuestions', () => {
  it('leaves all five unchecked without nonempty knowledge', () => {
    const rows = commonQuestions([{ topic: 'pricing', content: '   ' }]);
    expect(rows.map((r) => r.covered)).toEqual([false, false, false, false, false]);
    expect(rows.map((r) => r.topic)).toEqual(['pricing', 'services', 'timeline', 'proof', 'about']);
  });

  it('matches entry topics, ignoring case and whitespace, including imported topic names', () => {
    const rows = commonQuestions([
      { topic: ' Pricing ', content: 'From £500.' },
      { topic: 'services', content: 'Automation.' },
      { topic: 'onboarding', content: 'Two weeks.' },
      { topic: 'case studies', content: 'An example.' },
      { topic: 'audience', content: 'Founders.' },
    ]);
    expect(rows.map((r) => r.covered)).toEqual([true, true, true, true, true]);
  });

  it('does not treat a generic FAQ or mentions in content as covering all five topics', () => {
    const rows = commonQuestions([
      { topic: 'faq', content: 'Pricing services timeline proof about.' },
    ]);
    expect(rows.some((r) => r.covered)).toBe(false);
  });
});
