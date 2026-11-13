'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { sendFollowup } from '@/lib/followup/send';

export function FollowupSendButton({
  draft,
  pagePath,
  email,
}: {
  draft: string | null;
  pagePath: string | null;
  email: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);

  async function send() {
    if (!draft || !pagePath || busy) return;
    setBusy(true);
    setNotice('');
    setFailed(false);
    try {
      const result = await sendFollowup(
        { draft, pageUrl: new URL(pagePath, window.location.origin).href, email },
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
      if (result === 'shared' || result === 'email') setNotice('Tap Done once you have sent it.');
    } catch {
      setFailed(true);
      setNotice('Could not share or copy. Select the message and page link below to copy them.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0">
      <Button type="button" onClick={send} disabled={busy || !draft || !pagePath}>
        {busy ? 'Opening…' : 'Send'}
      </Button>
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
