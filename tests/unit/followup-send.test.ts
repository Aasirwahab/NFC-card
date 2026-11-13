import { describe, expect, it, vi } from 'vitest';
import { sendFollowup } from '@/lib/followup/send';

const message = {
  draft: 'Hi Tom. Reply stop.',
  pageUrl: 'https://example.com/c/abc',
  email: 'tom@example.com',
};
function platform() {
  return {
    share: vi.fn().mockResolvedValue(undefined),
    copy: vi.fn().mockResolvedValue(undefined),
    openMail: vi.fn(),
  };
}

describe('one-tap send', () => {
  it('shares the draft and the untracked page link from the tap', async () => {
    const p = platform();
    expect(await sendFollowup(message, p)).toBe('shared');
    expect(p.share).toHaveBeenCalledWith({ text: `${message.draft}\n\n${message.pageUrl}` });
    expect(p.copy).not.toHaveBeenCalled();
    expect(p.openMail).not.toHaveBeenCalled();
  });

  it('falls back to an encoded mailto when share is unavailable', async () => {
    const p = { ...platform(), share: undefined };
    expect(await sendFollowup(message, p)).toBe('email');
    expect(p.openMail).toHaveBeenCalledWith(
      `mailto:tom%40example.com?body=${encodeURIComponent(`${message.draft}\n\n${message.pageUrl}`)}`,
    );
    expect(p.copy).not.toHaveBeenCalled();
  });

  it('copies both message and link when there is no email', async () => {
    const p = { ...platform(), share: undefined };
    expect(await sendFollowup({ ...message, email: null }, p)).toBe('copied');
    expect(p.copy).toHaveBeenCalledWith(`${message.draft}\n\n${message.pageUrl}`);
  });

  it.each([Object.assign(new Error('cancelled'), { name: 'AbortError' }), { name: 'AbortError' }])(
    'does nothing else when the rep cancels share (%s)',
    async (error) => {
      const p = platform();
      p.share.mockRejectedValue(error);
      expect(await sendFollowup(message, p)).toBe('cancelled');
      expect(p.openMail).not.toHaveBeenCalled();
      expect(p.copy).not.toHaveBeenCalled();
    },
  );

  it('falls back after a share error or when mail cannot open', async () => {
    const p = platform();
    p.share.mockRejectedValue(new Error('not supported'));
    expect(await sendFollowup(message, p)).toBe('email');
    p.openMail.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(await sendFollowup(message, p)).toBe('copied');
  });

  it('rejects unsafe email targets and surfaces clipboard failure for manual copying', async () => {
    const p = { ...platform(), share: undefined };
    expect(
      await sendFollowup({ ...message, email: 'bad@example.com?bcc=other@example.com' }, p),
    ).toBe('copied');
    expect(p.openMail).not.toHaveBeenCalled();
    p.copy.mockRejectedValue(new Error('denied'));
    await expect(sendFollowup({ ...message, email: null }, p)).rejects.toThrow('denied');
  });
});
