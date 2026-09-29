'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { FollowupItem } from '@/lib/db/rep';
import { apiSend } from '@/lib/http/client';

/**
 * One no-tap follow-up draft (spec §19.3). Sent BY HAND: copy it, open LinkedIn or
 * email, then mark it sent. INSIGNAR never sends it and never tells the prospect
 * anything about whether they opened their card.
 */
export function FollowupCard({ item }: { item: FollowupItem }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const who = [item.prospectName, item.prospectCompany].filter(Boolean).join(' · ') || 'No name';

  async function copy() {
    try {
      await navigator.clipboard.writeText(item.text);
      setCopied(true);
    } catch {
      setError('Could not copy. Select the text and copy it instead.');
    }
  }

  async function markSent() {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/sessions/${item.sessionId}/followup/sent`, 'POST');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="border-line bg-surface rounded-xl border px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-ink truncate text-[15px] font-medium">{who}</p>
        <span className="text-ink-3 shrink-0 font-mono text-[11px]">
          Card {item.sequence} · {item.colour}
        </span>
      </div>
      <p className="text-ink-2 mt-2 text-[14px] leading-snug whitespace-pre-line">{item.text}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {item.channel === 'linkedin' && item.linkedinUrl ? (
          <a
            href={item.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-2 hover:text-ink text-[14px] underline underline-offset-2"
          >
            Open LinkedIn
          </a>
        ) : null}
        {item.channel === 'email' && item.prospectEmail ? (
          <a
            href={`mailto:${item.prospectEmail}`}
            className="text-ink-2 hover:text-ink text-[14px] underline underline-offset-2"
          >
            Open email
          </a>
        ) : null}
        <Button type="button" size="sm" onClick={markSent} disabled={busy} className="ml-auto">
          {busy ? 'Saving…' : 'Mark sent'}
        </Button>
      </div>
      {error ? <p className="text-warn mt-2 text-[13px]">{error}</p> : null}
    </div>
  );
}
