'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { followupMessage, followupTarget, sendFollowup } from '@/lib/followup/send';

export function FollowupSendButton({
  draft,
  pagePath,
  email,
  phone,
  shareOnly = false,
  label,
}: {
  draft: string | null;
  pagePath: string | null;
  email: string | null;
  phone: string | null;
  shareOnly?: boolean;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);

  const target = shareOnly ? null : followupTarget(email, phone);
  const recipient = target ? (target.result === 'email' ? email : phone) : null;

  async function send() {
    if (!draft || !pagePath || busy) return;
    setBusy(true);
    setNotice('');
    setFailed(false);
    try {
      const result = await sendFollowup(
        {
          draft,
          pageUrl: new URL(pagePath, window.location.origin).href,
          email: shareOnly ? null : email,
          phone: shareOnly ? null : phone,
          preferContact: Boolean(target),
        },
        {
          share: navigator.share ? (data) => navigator.share(data) : undefined,
          openMail: (url) => {
            window.location.href = url;
          },
          copy: (text) => navigator.clipboard.writeText(text),
        },
      );
      if (result === 'copied')
        setNotice('Message and page link copied. Paste them into your message.');
      if (result === 'shared' || result === 'email' || result === 'sms')
        setNotice('Tap Done once you have sent it.');
    } catch {
      setFailed(true);
      setNotice('Could not share or copy. Select the message and page link below to copy them.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-full min-w-0">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={shareOnly ? 'secondary' : 'primary'}
          onClick={() => send()}
          disabled={busy || !draft || !pagePath}
          aria-label={target?.label}
          className="h-auto min-h-12 max-w-full px-4 py-3 whitespace-normal"
        >
          {busy ? 'Opening…' : (label ?? (target ? 'Send note' : 'Share'))}
        </Button>
      </div>
      {recipient ? (
        <p className="text-ink-3 mt-1 max-w-full truncate text-[13px]" title={recipient}>
          {recipient}
        </p>
      ) : null}
      <p role="status" className="text-ink-3 mt-1 max-w-sm text-[13px] wrap-anywhere">
        {notice}
      </p>
      {failed && draft && pagePath ? (
        <p className="text-ink-2 mt-2 max-w-sm text-sm wrap-anywhere whitespace-pre-wrap select-text">
          {followupMessage(draft, new URL(pagePath, window.location.origin).href)}
        </p>
      ) : null}
    </div>
  );
}
