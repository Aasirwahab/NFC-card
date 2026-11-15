import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnswerChatQuestion } from '@/components/answer-chat-question';

vi.mock('@/app/(app)/settings/actions', () => ({ saveKnowledgeAction: vi.fn() }));

describe('answer question controls', () => {
  it('shows a labelled answer form with a suggested topic and safe prospect text', () => {
    const html = renderToStaticMarkup(
      createElement(AnswerChatQuestion, {
        question: { id: 42, question: '<script>What does it cost?</script>' },
      }),
    );
    expect(html).toContain('Answer this');
    expect(html).toContain('for="answer-42"');
    expect(html).toContain('value="pricing" selected=""');
    expect(html).toContain('without names, companies or numbers');
    expect(html).not.toContain('<script>What does it cost?</script>');
  });

  it('offers Send after the saved row is reloaded, with the exact saved answer', () => {
    const html = renderToStaticMarkup(
      createElement(AnswerChatQuestion, {
        question: {
          id: 42,
          question: 'How long?',
          resolved_at: '2026-11-14T00:00:00Z',
          saved_answer: '  First line.\n\nSecond line.  ',
        },
        repName: 'Zaid',
        contact: { name: 'Tom Smith', email: 'tom@example.com', phone: null, pagePath: '/c/abc' },
      }),
    );
    expect(html).toContain('Send this answer to Tom');
    expect(html).toContain('  First line.\n\nSecond line.  ');
    expect(html).not.toContain('Answer this');
  });

  it('does not reopen dismissed questions', () => {
    expect(
      renderToStaticMarkup(
        createElement(AnswerChatQuestion, {
          question: { id: 42, question: 'How long?', resolved_at: '2026-11-14T00:00:00Z' },
        }),
      ),
    ).toBe('');
  });
});
