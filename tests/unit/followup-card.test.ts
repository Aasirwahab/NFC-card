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
  it('shows repeat opens alongside the follow-up reason', () => {
    const html = renderToStaticMarkup(
      createElement(FollowupCard, {
        row: {
          ...row,
          state: 'opened-no-action',
          reason: 'No meeting booked, met today',
          signal: { label: 'Opened 3 times, last today', rank: 1 },
        },
      }),
    );
    expect(html).toContain('Opened 3 times, last today');
    expect(html).toContain('No meeting booked, met today');
  });
  it.each(['replied', 'dropped', 'sent', 'booked'] as const)(
    'renders no Send control for a %s contact without a draft',
    (state) => {
      const html = renderToStaticMarkup(createElement(FollowupCard, { row: { ...row, state } }));
      expect(html).not.toMatch(/>Send note<\/button>/);
      expect(html).not.toContain('Open email');
    },
  );

  it('keeps Send for an actionable contact with a draft', () => {
    const html = renderToStaticMarkup(
      createElement(FollowupCard, { row: { ...row, state: 'due-no-tap', draft: 'Hi Tom' } }),
    );
    expect(html).toMatch(/>Send note<\/button>/);
  });
  it('keeps Share and Copy inside More for a requested note', () => {
    const html = renderToStaticMarkup(
      createElement(FollowupCard, {
        row: { ...row, state: 'review', draft: 'Hi Tom', preferContact: true },
      }),
    );
    expect(html).toMatch(/>Send note<\/button>/);
    expect(html).not.toContain('Open email');
    const [visible, more] = html.split('<details');
    expect(visible).not.toMatch(/>Share<\/button>|>Copy<\/button>|Open LinkedIn/);
    expect(visible).toContain('Done');
    expect(more).toMatch(/>Share<\/button>/);
    expect(more).toMatch(/>Copy<\/button>/);
  });
  it.each([
    'bad@example.com?bcc=other@example.com',
    'one@example.com,two@example.com',
    'one@example.com\r\nBcc:two@example.com',
  ])('never renders Open email for an unsafe stored address: %s', (email) => {
    const html = renderToStaticMarkup(
      createElement(FollowupCard, { row: { ...row, draft: 'Hi', prospectEmail: email } }),
    );
    expect(html).not.toContain('Open email');
    expect(html).not.toContain('mailto:');
  });
  it('removes the duplicate Open email control', () => {
    const html = renderToStaticMarkup(
      createElement(FollowupCard, {
        row: { ...row, draft: 'Hi', prospectEmail: 'tom+tag@example.com' },
      }),
    );
    expect(html).not.toContain('Open email');
    expect(html).not.toContain('mailto:');
  });
  it('uses Share as the primary action when no recipient is known', () => {
    const html = renderToStaticMarkup(
      createElement(FollowupCard, {
        row: { ...row, state: 'review', draft: 'Hi', prospectEmail: null },
      }),
    );
    expect(html.split('<details')[0]).toMatch(/>Share<\/button>/);
    expect(html).not.toContain('Send to');
  });
  it('shows the exact SMS recipient on Send', () => {
    const html = renderToStaticMarkup(
      createElement(FollowupCard, {
        row: {
          ...row,
          draft: 'Hi',
          prospectEmail: null,
          prospectPhone: '+447700900123',
          preferContact: true,
        },
      }),
    );
    expect(html).toMatch(/>Send note<\/button>/);
    expect(html).toContain('+447700900123');
  });
});

it('clamps the draft and keeps a long recipient outside the send button', () => {
  const email = 'bartholomew.fitzgerald@northwind-industries-holdings.example.com';
  const html = renderToStaticMarkup(
    createElement(FollowupCard, { row: { ...row, draft: 'A long draft', prospectEmail: email } }),
  );
  expect(html).toContain('line-clamp-3');
  expect(html).toContain('Show all');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toMatch(/>Send note<\/button>/);
  expect(html).not.toMatch(/<button[^>]*>[^<]*northwind/);
  expect(html).toContain(email);
});
