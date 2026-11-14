import { z } from 'zod';

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
  const text = `${message.draft}\n\n${message.pageUrl}`;
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
