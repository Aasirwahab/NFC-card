import { describe, expect, it } from 'vitest';
import { composeAnswerDraft, guessKnowledgeTopic } from '@/lib/chat/answer';
import { followupMessage } from '@/lib/followup/send';
import { STOP_LINE } from '@/lib/followup/draft';

describe('answer once', () => {
  it('keeps the rep answer exactly, quotes a bounded single-line question and adds the page before stop', () => {
    const answer = '  First line.\n\nSecond line — exactly.  ';
    const draft = composeAnswerDraft({
      question: `What\n\t“price”? ${'x'.repeat(160)}`,
      answer,
      repName: 'Zaid Ahmed',
      contactName: 'Tom Jones',
    });
    expect(draft).toContain(`\n\n${answer}\n\n`);
    const quoted = draft.split('\n\n')[1]!;
    expect(quoted.startsWith('You asked: “What price? ')).toBe(true);
    expect(quoted.length).toBeLessThanOrEqual('You asked: “”'.length + 120);
    const sent = followupMessage(draft, 'https://example.com/c/abc');
    expect(sent).toContain(answer);
    expect(sent).toContain(`https://example.com/c/abc\n\nZaid\n\n${STOP_LINE}`);
    expect(sent).toContain('Hi Tom,');
  });

  it.each([
    ['What does it cost?', 'pricing'],
    ['How long does setup take?', 'timeline'],
    ['Any examples of results?', 'proof'],
    ['What services do you offer?', 'services'],
    ['Who are you?', 'about'],
    ['Do you support this?', 'faq'],
  ])('suggests a knowledge topic for %s', (question, topic) => {
    expect(guessKnowledgeTopic(question)).toBe(topic);
  });
});
