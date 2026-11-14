import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FollowupCard } from '@/components/followup-card';
import type { FollowupRow } from '@/lib/db/rep';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const row: FollowupRow = {
  sessionId: 'contact',
  state: 'replied',
  reason: 'They replied',
  signal: { label: 'Not opened yet', rank: 0 },
  pagePath: '/c/abc',
  draft: null,
  channel: 'email',
  prospectName: 'Tom',
  prospectCompany: null,
  linkedinUrl: null,
  prospectEmail: 'tom@example.com',
  prospectPhone: null,
  preferContact: false,
  sequence: 1,
  colour: 'Blue',
};

describe('follow-up send control', () => {
  it.each(['replied', 'dropped', 'sent', 'booked'] as const)(
    'renders no Send control for a %s contact without a draft',
    (state) => {
      const html = renderToStaticMarkup(createElement(FollowupCard, { row: { ...row, state } }));
      expect(html).not.toMatch(/>Send<\/button>/);
      expect(html).not.toContain('Open email');
    },
  );

  it('keeps Send for an actionable contact with a draft', () => {
    const html = renderToStaticMarkup(
      createElement(FollowupCard, { row: { ...row, state: 'due-no-tap', draft: 'Hi Tom' } }),
    );
    expect(html).toMatch(/>Send<\/button>/);
  });
  it('keeps Share beside Send for a requested note', () => {
    const html = renderToStaticMarkup(
      createElement(FollowupCard, {
        row: { ...row, state: 'review', draft: 'Hi Tom', preferContact: true },
      }),
    );
    expect(html).toMatch(/>Send<\/button>/);
    expect(html).toMatch(/>Share<\/button>/);
  });
});
