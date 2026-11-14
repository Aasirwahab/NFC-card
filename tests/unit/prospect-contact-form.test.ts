import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProspectContactForm } from '@/components/prospect-contact-form';
import { parseContactForm } from '@/lib/domain/contact-form';

describe('prospect contact form rendering', () => {
  it('renders custom copy, accessible choices, optional labels and consent', () => {
    const config = parseContactForm({
      questions: [
        {
          id: 'when',
          label: 'When?',
          type: 'choice',
          options: ['Ask {first}', 'Later'],
          required: true,
        },
      ],
    });
    const html = renderToStaticMarkup(
      createElement(ProspectContactForm, { config, first: 'Sam', values: {} }),
    );
    expect(html).toContain('Share your details with Sam');
    expect(html).toContain('Email address or UK mobile');
    expect(html).toContain('<legend');
    expect(html).toContain('type="radio"');
    expect(html).toContain('Ask Sam</span>');
    expect(html).toContain('What would you like from Sam? (optional)');
    expect(html).toContain('maxLength="300"');
    expect(html).toContain(
      'Sam will use this only to get back to you. You can remove it any time.',
    );
    expect(html).toContain('href="/privacy"');
  });
  it('allows an optional choice to be cleared', () => {
    const config = parseContactForm({
      questions: [
        { id: 'when', label: 'When?', type: 'choice', options: ['Now', 'Later'], required: false },
      ],
    });
    const html = renderToStaticMarkup(
      createElement(ProspectContactForm, {
        config,
        first: 'Sam',
        values: { 'question:when': 'Now' },
      }),
    );
    expect(html).toContain('Clear answer');
  });
  it('disables preview controls and hides disabled forms', () => {
    const html = renderToStaticMarkup(
      createElement(ProspectContactForm, {
        config: parseContactForm(null),
        first: 'Sam',
        values: {},
        preview: true,
      }),
    );
    expect(html).toContain('<fieldset disabled=""');
    expect(html).not.toContain('href="/privacy"');
    expect(
      renderToStaticMarkup(
        createElement(ProspectContactForm, {
          config: { ...parseContactForm(null), enabled: false },
          first: 'Sam',
          values: {},
        }),
      ),
    ).toBe('');
  });
});
