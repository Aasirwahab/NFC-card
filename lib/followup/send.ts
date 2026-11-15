import { z } from 'zod';
import { normaliseRequestContact, type RequestChannel } from '@/lib/domain/prospect-requests';
import { STOP_LINE } from './draft';

type SendPlatform = {
  share?: (data: ShareData) => Promise<void>;
  copy: (text: string) => Promise<void>;
  openMail: (url: string) => void;
};

/** One validated target for both the visible recipient and the opened message. */
export function followupTarget(email: string | null, phone?: string | null) {
  return email && z.email().safeParse(email).success
    ? {
        scheme: 'mailto',
        address: encodeURIComponent(email),
        label: `Send to ${email}`,
        result: 'email' as const,
      }
    : phone && /^\+\d{7,15}$/.test(phone) && !/\s/.test(phone)
      ? { scheme: 'sms', address: phone, label: `Text ${phone}`, result: 'sms' as const }
      : null;
}

/** Only the requested channel and a fixed reply; opening it never records a send. */
export function requestReplyLink(input: {
  channel: RequestChannel;
  contact: string;
  prospectName: string | null;
  repFullName: string;
  businessName: string | null;
  eventName: string | null;
  pageUrl: string;
}): { href: string; label: string } | null {
  if (/[\p{Cc}\p{Cf}]/u.test(input.contact)) return null;
  const contact = normaliseRequestContact(input.channel, input.contact);
  if (!contact) return null;
  if (input.channel === 'call') return { href: `tel:${contact}`, label: `Call ${contact}` };

  // These fields are saved by the rep; control characters must still never reach a URI.
  const fields = [input.prospectName, input.repFullName, input.businessName, input.eventName];
  if (
    fields.some(
      (value) =>
        value && (value.length > 300 || /[\p{Cc}\p{Cf}]/u.test(value) || !value.isWellFormed()),
    )
  )
    return null;
  if (
    input.pageUrl.length > 2048 ||
    /[\p{Cc}\p{Cf}\\]/u.test(input.pageUrl) ||
    !input.pageUrl.isWellFormed()
  )
    return null;
  let page: URL;
  try {
    page = new URL(input.pageUrl);
  } catch {
    return null;
  }
  if (
    !['https:', 'http:'].includes(page.protocol) ||
    !page.hostname ||
    page.username ||
    page.password
  )
    return null;

  const prospectFirst = input.prospectName?.trim().split(/\s+/)[0] || 'there';
  const repFirst = input.repFullName.trim().split(/\s+/)[0] || 'the team';
  const business = input.businessName?.trim() || 'our business';
  const event = input.eventName?.trim() || 'the event';
  const text = `Hi ${prospectFirst}, it's ${repFirst} from ${business}. You asked me to send the details from our chat at ${event}: ${page.href}. Reply stop and I won't message again.`;
  const body = encodeURIComponent(text);
  if (input.channel === 'whatsapp')
    return { href: `https://wa.me/${contact.slice(1)}?text=${body}`, label: `WhatsApp ${contact}` };
  const target = followupTarget(
    input.channel === 'email' ? contact : null,
    input.channel === 'text' ? contact : null,
  );
  if (!target) return null;
  return {
    href: `${target.scheme}:${target.address}?body=${body}`,
    label: `${input.channel === 'email' ? 'Email' : 'Text'} ${contact}`,
  };
}

/** Keep the page link before the sign-off and stop line in a multi-line message. */
export function followupMessage(draft: string, pageUrl: string): string {
  const paragraphs = draft.split('\n\n');
  if (paragraphs.length >= 4 && paragraphs.at(-1) === STOP_LINE) {
    paragraphs.splice(-2, 0, pageUrl);
    return paragraphs.join('\n\n');
  }
  return `${draft}\n\n${pageUrl}`;
}

/** Opening a share sheet or email is not confirmation that the rep sent it. */
export async function sendFollowup(
  message: {
    draft: string;
    pageUrl: string;
    email: string | null;
    phone?: string | null;
    preferContact?: boolean;
  },
  platform: SendPlatform,
): Promise<'shared' | 'email' | 'sms' | 'copied' | 'cancelled'> {
  const text = followupMessage(message.draft, message.pageUrl);
  const target = followupTarget(message.email, message.phone);
  function openContact() {
    if (!target) return null;
    try {
      platform.openMail(`${target.scheme}:${target.address}?body=${encodeURIComponent(text)}`);
      return target.result;
    } catch {
      return null;
    }
  }
  if (message.preferContact) {
    const result = openContact();
    if (result) return result;
  }
  if (platform.share) {
    try {
      await platform.share({ text });
      return 'shared';
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        error.name === 'AbortError'
      )
        return 'cancelled';
    }
  }
  if (!message.preferContact) {
    const result = openContact();
    if (result) return result;
  }
  await platform.copy(text);
  return 'copied';
}
