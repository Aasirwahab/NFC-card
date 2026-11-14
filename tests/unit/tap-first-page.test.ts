import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Holding } from '@/app/c/[code]/holding';
import { MadeWith } from '@/app/c/[code]/made-with';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const details = {
  ready: true,
  problems: ['Missed enquiries', 'Slow quotes'],
  picked: ['Missed enquiries'],
  expiresAt: null,
};

describe('tap first prospect content', () => {
  it('renders the calm promise, accessible chips and consent beside the field', () => {
    const html = renderToStaticMarkup(
      createElement(Holding, { code: 'ABCD2345', first: 'Sam', details }),
    );
    expect(html).toContain(
      'Sam&#x27;s note about your conversation appears here once it&#x27;s written.',
    );
    expect(html).toContain('Want it sent to you?');
    expect(html).toContain('Leave your email or mobile and Sam will send you the note.');
    expect(html).toContain('What matters most to you right now?');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-describedby="prospect-contact-help prospect-consent"');
    expect(html).toContain(
      'Sam will use this only to send you this note. You can remove it any time.',
    );
    expect(html).toContain('href="/privacy"');
    expect(html.indexOf('prospect-consent')).toBeLessThan(html.lastIndexOf('Send it to me'));
  });
  it('server-renders already answered without selected values or a contact field', () => {
    const html = renderToStaticMarkup(
      createElement(Holding, {
        code: 'ABCD2345',
        first: 'Sam',
        details: { ...details, picked: [], readOnly: true },
      }),
    );
    expect(html).toContain('Answers have already been given on this card.');
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).not.toContain('<input');
  });
  it('hides the question with no rep problems, and inputs before first-tap registration', () => {
    const noChips = renderToStaticMarkup(
      createElement(Holding, {
        code: 'ABCD2345',
        first: 'Sam',
        details: { ...details, problems: [] },
      }),
    );
    expect(noChips).not.toContain('What matters most');
    expect(noChips).toContain('prospect-contact');
    const bootstrap = renderToStaticMarkup(
      createElement(Holding, {
        code: 'ABCD2345',
        first: 'Sam',
        details: { ...details, ready: false },
      }),
    );
    expect(bootstrap).toContain('once it&#x27;s written.');
    expect(bootstrap).not.toContain('<input');
  });
  it('shows no more than six choices and allows unticking at the two-choice limit', () => {
    const html = renderToStaticMarkup(
      createElement(Holding, {
        code: 'ABCD2345',
        first: 'Sam',
        details: { ...details, problems: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], picked: ['A', 'B'] },
      }),
    );
    expect(html.match(/aria-pressed=/g)).toHaveLength(6);
    expect(html.match(/disabled=""/g)).toHaveLength(4);
    expect(html).not.toContain('>G</button>');
  });
  it('keeps current chips usable when the rep has removed both earlier choices', () => {
    const html = renderToStaticMarkup(
      createElement(Holding, {
        code: 'ABCD2345',
        first: 'Sam',
        details: { ...details, picked: ['Removed one', 'Removed two'] },
      }),
    );
    expect(html).not.toContain('disabled=""');
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
  });
  it('attributes the footer to the rep and uses the requested referral', () => {
    const html = renderToStaticMarkup(createElement(MadeWith, { first: 'Sam', code: 'ABCD2345' }));
    expect(html).toContain('href="/?ref=page"');
    expect(html).toContain('Sam uses INSIGNAR');
  });
});
