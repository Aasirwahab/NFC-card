import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UnansweredQuestions } from '@/app/(app)/settings/settings-forms';

vi.mock('@/app/(app)/settings/actions', () => ({
  saveBusinessAction: vi.fn(),
  deletePlaybookAction: vi.fn(),
  dismissUnansweredAction: vi.fn(),
  saveKnowledgeAction: vi.fn(),
  savePlaybookAction: vi.fn(),
  saveProfileAction: vi.fn(),
  savePitchVoiceAction: vi.fn(),
}));

function renderQuestion(status: string) {
  return renderToStaticMarkup(
    createElement(UnansweredQuestions, {
      questions: [
        {
          id: 42,
          question: 'How long?',
          resolved_at: '2026-11-14T00:00:00Z',
          saved_answer: 'Two weeks.',
          sessions: {
            status,
            prospect_name: 'Tom Smith',
            prospect_email: 'tom@example.com',
            prospect_submitted_email: null,
            prospect_submitted_phone: null,
            cards: { code: 'abc' },
          },
        },
      ],
      loadError: false,
      repName: 'Zaid',
    }),
  );
}

describe('Setup saved answers', () => {
  it('offers Send for the active contact page', () => {
    expect(renderQuestion('active')).toContain('Send this answer to Tom');
  });

  it('keeps the saved answer visible without offering a dead page for a closed contact', () => {
    const html = renderQuestion('superseded');
    expect(html).toContain('Two weeks.');
    expect(html).toContain('This contact no longer has a page to send.');
    expect(html).not.toContain('Send this answer to Tom');
  });
});
