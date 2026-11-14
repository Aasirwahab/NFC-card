'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { followupTarget, sendFollowup } from '@/lib/followup/send';

export function FollowupSendButton({
  draft,
  pagePath,
  email,
  phone,
  preferContact,
}: {
  draft: string | null;
  pagePath: string | null;
  email: string | null;
  phone: string | null;
  preferContact: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);

  const target = followupTarget(email, phone);

  async function send(share = false) {
    if (!draft || !pagePath || busy) return;
    setBusy(true);
    setNotice('');
    setFailed(false);
    try {
      const result = await sendFollowup(
        {
          draft,
          pageUrl: new URL(pagePath, window.location.origin).href,
          email: share ? null : email,
          phone: share ? null : phone,
          preferContact: !share && Boolean(target),
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
    <div className="min-w-0">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => send()}
          disabled={busy || !draft || !pagePath}
          className="h-auto min-h-11 min-w-0 break-all whitespace-normal"
        >
          {busy ? 'Opening…' : (target?.label ?? 'Share')}
        </Button>
        {preferContact && target ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => send(true)}
            disabled={busy || !draft || !pagePath}
          >
            Share
          </Button>
        ) : null}
      </div>
      <p role="status" className="text-ink-3 mt-1 max-w-sm text-[13px] wrap-anywhere">
        {notice}
      </p>
      {failed && draft && pagePath ? (
        <p className="text-ink-2 mt-2 max-w-sm text-sm wrap-anywhere whitespace-pre-wrap select-text">
          {draft}
          {'\n\n'}
          {new URL(pagePath, window.location.origin).href}
        </p>
      ) : null}
    </div>
  );
}
