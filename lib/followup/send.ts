import { z } from 'zod';

type SendPlatform = {
  share?: (data: ShareData) => Promise<void>;
  copy: (text: string) => Promise<void>;
  openMail: (url: string) => void;
};

/** Opening a share sheet or email is not confirmation that the rep sent it. */
export async function sendFollowup(
  message: { draft: string; pageUrl: string; email: string | null },
  platform: SendPlatform,
): Promise<'shared' | 'email' | 'copied' | 'cancelled'> {
  const text = `${message.draft}\n\n${message.pageUrl}`;
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
  if (message.email && z.email().safeParse(message.email).success) {
    try {
      platform.openMail(
        `mailto:${encodeURIComponent(message.email)}?body=${encodeURIComponent(text)}`,
      );
      return 'email';
    } catch {
      // A blocked email handler still leaves the message available to copy.
    }
  }
  await platform.copy(text);
  return 'copied';
}
