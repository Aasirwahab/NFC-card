/**
 * The validation-free half of prospect requests: safe to import from browser
 * components without shipping zod to every prospect's phone. prospect-requests.ts
 * re-exports all of this and adds the schema and the strict server-side contact
 * normaliser. Never import zod, prospect-requests or prospect-answers at runtime here.
 */

export const REQUEST_CONSENT_VERSION = '2026-11-14-v1';
export const requestChannels = ['call', 'text', 'whatsapp', 'email'] as const;
export type RequestChannel = (typeof requestChannels)[number];
export type RequestKind = 'call' | 'details';
export type BestTime = 'today' | 'tomorrow_morning' | 'this_week';

export const channelLabels: Record<RequestChannel, string> = {
  call: 'Call',
  text: 'Text',
  whatsapp: 'WhatsApp',
  email: 'Email',
};
export const bestTimeLabels: Record<BestTime, string> = {
  today: 'Today',
  tomorrow_morning: 'Tomorrow morning',
  this_week: 'This week',
};

export function requestConsent(first: string, channel: RequestChannel): string {
  return `${first} will contact you once by ${channelLabels[channel]} about this. Nothing else.`;
}

const EMAIL =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const UK_MOBILE = /^(?:0|(?:\+|00)440?)7[1-57-9]\d{8}$/;

/**
 * Browser-side gate only: the right kind of contact for the channel. The server
 * re-checks with the strict normaliser, so this never decides what is stored.
 */
export function looksLikeRequestContact(channel: RequestChannel, value: string): boolean {
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  const trimmed = value.trim();
  if (channel === 'email') return trimmed.length <= 254 && EMAIL.test(trimmed.toLowerCase());
  return UK_MOBILE.test(trimmed.replace(/[\s().-]/g, ''));
}
