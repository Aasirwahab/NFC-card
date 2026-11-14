import { z } from 'zod';

type SendPlatform = {
  share?: (data: ShareData) => Promise<void>;
  copy: (text: string) => Promise<void>;
  openMail: (url: string) => void;
};

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
  const target =
    message.email && z.email().safeParse(message.email).success
      ? { scheme: 'mailto', address: encodeURIComponent(message.email), result: 'email' as const }
      : message.phone && /^\+\d{7,15}$/.test(message.phone) && !/\s/.test(message.phone)
        ? { scheme: 'sms', address: message.phone, result: 'sms' as const }
        : null;
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
