import { z } from 'zod';
import { normaliseProspectContact } from './prospect-answers';
import { requestChannels, type RequestChannel } from './prospect-requests-view';

export {
  REQUEST_CONSENT_VERSION,
  requestChannels,
  channelLabels,
  bestTimeLabels,
  requestConsent,
  type RequestChannel,
  type RequestKind,
  type BestTime,
} from './prospect-requests-view';

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
