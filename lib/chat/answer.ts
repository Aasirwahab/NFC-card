import { quoteProspectQuestion, STOP_LINE } from '@/lib/followup/draft';

/** A rep-written answer is never rewritten by a model. */
export function composeAnswerDraft(input: {
  question: string;
  answer: string;
  repName: string;
  contactName: string | null;
}): string {
  const contact = input.contactName?.trim().split(/\s+/)[0];
  const rep = input.repName.trim().split(/\s+/)[0] || 'Your contact';
  return [
    contact ? `Hi ${contact},` : 'Hi,',
    `You asked: “${quoteProspectQuestion(input.question)}”`,
    input.answer,
    rep,
    STOP_LINE,
  ].join('\n\n');
}

export function guessKnowledgeTopic(question: string): string {
  if (/\b(?:price|pricing|cost|discount|charge|fee|budget)\b/i.test(question)) return 'pricing';
  if (/\b(?:when|long|timeline|deliver|delivery|setup|start|date)\b/i.test(question))
    return 'timeline';
  if (/\b(?:example|examples|proof|results|case stud(?:y|ies))\b/i.test(question)) return 'proof';
  if (/\b(?:services|offer|sell|provide)\b/i.test(question)) return 'services';
  if (/\b(?:who|company|team|about)\b/i.test(question)) return 'about';
  return 'faq';
}
