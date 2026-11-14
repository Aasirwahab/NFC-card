import { describe, expect, it, vi } from 'vitest';
import { sendFollowup } from '@/lib/followup/send';
import { composeFollowupDraft } from '@/lib/followup/draft';

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

  it.each(['email', 'share', 'copy'])(
    'puts the note link before the sign-off and stop line via %s',
    async (channel) => {
      const draft = composeFollowupDraft({
        channel: 'email',
        state: 'requested-note',
        prospectName: 'Tom',
        repFullName: 'Zaid',
        businessName: 'Example',
        problem: null,
        question: 'What does it cost?',
      });
      const text =
        "Hi Tom,\n\nHere is your note from our conversation.\n\nhttps://example.com/c/abc\n\nZaid, Example\n\nReply stop and I won't write again.";
      const p = {
        ...platform(),
        share: channel === 'copy' ? undefined : vi.fn().mockResolvedValue(undefined),
      };
      await sendFollowup(
        {
          ...message,
          draft,
          email: channel === 'email' ? message.email : null,
          preferContact: channel === 'email',
        },
        p,
      );
      if (channel === 'email')
        expect(p.openMail).toHaveBeenCalledWith(
          `mailto:tom%40example.com?body=${encodeURIComponent(text)}`,
        );
      if (channel === 'share') expect(p.share).toHaveBeenCalledWith({ text });
      if (channel === 'copy') expect(p.copy).toHaveBeenCalledWith(text);
    },
  );

  it('opens a requested email directly even when sharing is available', async () => {
    const p = platform();
    expect(await sendFollowup({ ...message, preferContact: true }, p)).toBe('email');
    expect(p.openMail).toHaveBeenCalledWith(
      `mailto:tom%40example.com?body=${encodeURIComponent(`${message.draft}\n\n${message.pageUrl}`)}`,
    );
    expect(p.share).not.toHaveBeenCalled();
  });

  it('opens a requested mobile directly with the same draft and link', async () => {
    const p = platform();
    expect(
      await sendFollowup(
        { ...message, email: null, phone: '+447700900123', preferContact: true },
        p,
      ),
    ).toBe('sms');
    expect(p.openMail).toHaveBeenCalledWith(
      `sms:+447700900123?body=${encodeURIComponent(`${message.draft}\n\n${message.pageUrl}`)}`,
    );
    expect(p.share).not.toHaveBeenCalled();
  });

  it('prefers the supplied email over a mobile and keeps sharing as the other option', async () => {
    const p = platform();
    const requested = { ...message, phone: '+447700900123', preferContact: true };
    expect(await sendFollowup(requested, p)).toBe('email');
    expect(await sendFollowup({ ...requested, preferContact: false }, p)).toBe('shared');
    p.openMail.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(await sendFollowup(requested, p)).toBe('shared');
  });

  it.each(['+447700900123?body=bad', 'javascript:alert(1)', '+447700900123\r\n'])(
    'never opens an unsafe SMS target: %s',
    async (phone) => {
      const p = { ...platform(), share: undefined };
      expect(await sendFollowup({ ...message, email: null, phone, preferContact: true }, p)).toBe(
        'copied',
      );
      expect(p.openMail).not.toHaveBeenCalled();
    },
  );

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
