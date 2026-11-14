import { z } from 'zod';
import { normaliseProspectContact } from './prospect-answers';

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

/** Channel is part of the consent: an email cannot silently become a text. */
export function normaliseRequestContact(channel: RequestChannel, value: string): string | null {
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const contact = normaliseProspectContact(value);
  return (channel === 'email' ? contact?.email : contact?.phone) ?? null;
}

export const prospectRequestSchema = z
  .object({
    kind: z.enum(['call', 'details']),
    channel: z.enum(requestChannels),
    contact: z.string().trim().min(1).max(254),
    bestTime: z.enum(['today', 'tomorrow_morning', 'this_week']).nullable().optional(),
    consent: z.literal(true),
  })
  .strict()
  .refine((value) => normaliseRequestContact(value.channel, value.contact) !== null, {
    path: ['contact'],
  });
