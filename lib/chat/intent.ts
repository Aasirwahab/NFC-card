import type { ModelReply } from '@/lib/chat/assistant';
import type { PageAction } from '@/lib/landing/actions';

const EMAIL = /\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}\b/gi;
const PHONE = /(?<![\p{L}\d])\+?\d[\d ()-]{5,}\d(?![\p{L}\d])/gu;

/** Used on prompt copies only; the original chat log is left intact. */
export function redactContacts(text: string): string {
  return text
    .replace(EMAIL, '[email redacted]')
    .replace(PHONE, (match) => (match.replace(/\D/g, '').length >= 7 ? '[phone redacted]' : match));
}

// Whole-message requests only: product questions and mixed requests go to the model.
const BOOKING =
  /^(?:(?:can|could|may) (?:i|we) |(?:i|we)(?:'d| would) like to |(?:please )?)(?:book|schedule|arrange)(?: in)? (?:a |an |the )?(?:call|meeting|appointment|demo)(?: (?:with (?:you|[\p{L}]+)|this week|next week|today|tomorrow))*[.!?]*$/iu;

export function routeKnownIntent(message: string, actions: PageAction[]): ModelReply | null {
  const contactShared = redactContacts(message) !== message;
  if (!contactShared && !BOOKING.test(message.trim())) return null;
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
    reply: `${contactShared ? 'I can’t arrange calls or pass messages from this chat. ' : ''}${next}`,
    action: action?.id ?? null,
  };
}
