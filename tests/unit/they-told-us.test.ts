import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TheyToldUs, selectProspectProblem } from '@/app/(app)/sessions/[id]/edit/they-told-us';

const niches = [
  { name: 'Sales', problems: ['Slow replies'] },
  { name: 'Service', problems: ['Missed calls'] },
];

describe('using what the prospect told us', () => {
  it('adds the area that makes a prospect chip visible, preserving existing choices', () => {
    expect(selectProspectProblem('Missed calls', ['Slow replies'], ['Sales'], niches, [])).toEqual({
      problems: ['Slow replies', 'Missed calls'],
      selectedNiches: ['Sales', 'Service'],
    });
  });
  it('refuses removed chips, too many choices and areas that do not fit', () => {
    expect(selectProspectProblem('Removed', [], ['Sales'], niches, [])).toBeNull();
    const many = [{ name: 'Sales', problems: ['1', '2', '3', '4', '5', '6'] }];
    expect(selectProspectProblem('6', ['1', '2', '3', '4', '5'], ['Sales'], many, [])).toBeNull();
    const long = [
      { name: 'a'.repeat(79), problems: ['one'] },
      { name: 'b', problems: ['two'] },
    ];
    expect(selectProspectProblem('two', ['one'], ['a'.repeat(79)], long, [])).toBeNull();
  });
  it('allows the playbook fallback only when the event has no problem chips', () => {
    expect(selectProspectProblem('Fallback', [], [], [], ['Fallback'])).toEqual({
      problems: ['Fallback'],
      selectedNiches: [],
    });
    expect(selectProspectProblem('Fallback', [], ['Sales'], niches, ['Fallback'])).toBeNull();
  });
  it('renders nothing without prospect answers', () => {
    expect(
      renderToStaticMarkup(
        createElement(TheyToldUs, {
          session: {},
          niches,
          fallbackProblems: [],
          current: { email: '', phone: '', problems: [], selectedNiches: ['Sales'] },
          onContact: () => {},
          onProblems: () => {},
        }),
      ),
    ).toBe('');
  });
  it('shows the prospect picks and contact with accessible Use buttons', () => {
    const html = renderToStaticMarkup(
      createElement(TheyToldUs, {
        session: {
          prospect_picked_problems: ['Missed calls'],
          prospect_submitted_email: 'person@example.test',
        },
        niches,
        fallbackProblems: [],
        current: { email: '', phone: '', problems: [], selectedNiches: ['Sales'] },
        onContact: () => {},
        onProblems: () => {},
      }),
    );
    expect(html).toContain('They told us');
    expect(html).toContain('Missed calls');
    expect(html).toContain('person@example.test');
    expect(html).toContain('Use their email');
    expect(html).toContain('Use problem: Missed calls');
  });
});
