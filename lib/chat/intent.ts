import type { ModelReply } from '@/lib/chat/assistant';
import type { PageAction } from '@/lib/landing/actions';

const EMAIL = /\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}\b/gi;
const PHONE = /(?<![\p{L}\d])\+?\d[\d ().-]{5,}\d(?![\p{L}\d])/gu;

/** Used on prompt copies only; the original chat log is left intact. */
export function redactContacts(text: string): string {
  return text
    .replace(EMAIL, '[email redacted]')
    .replace(PHONE, (match) => (match.replace(/\D/g, '').length >= 7 ? '[phone redacted]' : match));
}

// Whole-message requests only: product questions and mixed requests go to the model.
const BOOKING =
  /^(?:(?:can|could|may) (?:i|we) |(?:i|we)(?:'d| would) like to |(?:please )?)(?:book|schedule|arrange)(?: in)? (?:a |an |the )?(?:call|meeting|appointment|demo)(?: (?:with (?:you|[\p{L}]+)|this week|next week|today|tomorrow))*[.!?]*$/iu;

// A callback request in so many words. Short messages only: a long question that happens to
// contain "call me" is a product question and goes to the model.
const CALLBACK =
  /\b(?:call|ring|phone|text|whatsapp|contact|reach)\s+me\b|\bgive me a (?:call|ring)\b|\bcall(?:\s|-)?back\b|\bget back to me\b|\b(?:ask|tell|have|get)\s+[\p{L}]+\s+to\s+(?:call|ring|phone|contact|email|text|message)\b|\b(?:i(?:'d| would) like|can (?:i|we) (?:have|get)|could (?:i|we) (?:have|get)) a (?:call|callback)\b/iu;

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

export function routeKnownIntent(message: string, actions: PageAction[]): ModelReply | null {
  const text = message.trim();
  const redacted = redactContacts(text);
  const contactShared = redacted !== text;
  // Contact details are the whole message only when almost nothing else is said and it is not a
  // question: "Is jane@example.com your support address?" must reach the model.
  const leftover = redacted.replace(/\[(?:email|phone) redacted\]/g, ' ');
  const asksSomething =
    /^(?:does|do|is|are|can|could|will|would|what|how|where|why|who|when|which)\b/i.test(
      leftover.trim(),
    );
  const justContact =
    contactShared && !text.includes('?') && !asksSomething && wordCount(leftover) <= 5;
  const callback = wordCount(text) <= 15 && CALLBACK.test(text);
  const booking = BOOKING.test(text);
  if (!justContact && !callback && !booking) return null;
  const noMessages = justContact || callback;
  const action =
    actions.find((a) => a.id === 'book') ??
    actions.find((a) => a.id === 'linkedin') ??
    actions.find((a) => a.id === 'save-contact');
  const next =
    action?.id === 'book'
      ? 'Use Book on this page to choose a time.'
      : action?.id === 'linkedin'
        ? 'Use LinkedIn connect on this page to get in touch directly.'
        : action?.id === 'save-contact'
          ? 'Use Save contact to keep the rep’s details and contact them directly.'
          : 'Please contact the rep directly.';
  return {
    outcome: 'action',
    reply: `${noMessages ? 'I can’t arrange calls or pass messages from this chat. ' : ''}${next}`,
    action: action?.id ?? null,
  };
}
