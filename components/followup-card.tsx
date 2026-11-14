'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from '@/app/ui-slice.module.css';
import { useRouter } from 'next/navigation';
import { Button, buttonStyles } from '@/components/ui/button';
import type { FollowupRow } from '@/lib/db/rep';
import { apiSend } from '@/lib/http/client';
import { FollowupSendButton } from '@/components/followup-send-button';

/** How many leads show before "Show all", so Today stays one short list. */
const FIRST_SHOWN = 4;

/**
 * "Follow up today" (spec §19.3): who to message now, and what to say. The rep
 * sends it BY HAND from their own LinkedIn, email or any app: copy, open, send,
 * Done. INSIGNAR sends nothing and works with no email provider. Anything already
 * sent, booked or closed sits in a collapsed History.
 */
/** Free-mail domains: cold email to these needs the person's agreement (docs/LEGAL_DRAFTS.md §4). */
const PERSONAL_DOMAINS =
  /@(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|aol|proton|protonmail)\./i;
function isPersonalAddress(email: string | null | undefined): boolean {
  return Boolean(email && PERSONAL_DOMAINS.test(email));
}

export function FollowupToday({
  actionable,
  history,
}: {
  actionable: FollowupRow[];
  history: FollowupRow[];
}) {
  const [all, setAll] = useState(false);
  const shown = all ? actionable : actionable.slice(0, FIRST_SHOWN);

  return (
    <section>
      <h2 className="text-ink text-base font-semibold">Follow up today · {actionable.length}</h2>
      <p className="text-ink-3 mt-1 text-[13px] leading-snug">
        A note to send yourself, in your own words if you like. Tap Done once you have sent it.
      </p>

      {actionable.length === 0 ? (
        <p className="text-ink-2 mt-2.5 text-sm">No one to follow up with right now.</p>
      ) : (
        <div className="mt-2.5 flex flex-col">
          {shown.map((row) => (
            <FollowupCard key={row.sessionId} row={row} />
          ))}
        </div>
      )}
      {!all && actionable.length > FIRST_SHOWN ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => setAll(true)}
        >
          Show all {actionable.length}
        </Button>
      ) : null}

      {history.length > 0 ? (
        <details className="mt-4">
          <summary className="text-ink-2 inline-flex min-h-11 cursor-pointer items-center text-sm font-medium">
            History · {history.length}
          </summary>
          <div className="flex flex-col">
            {history.map((row) => (
              <FollowupCard key={row.sessionId} row={row} />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export function FollowupCard({ row }: { row: FollowupRow }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const who = [row.prospectName, row.prospectCompany].filter(Boolean).join(' · ') || 'No name';
  const waiting = row.state === 'due-no-tap' || row.state === 'opened-no-action';
  const closed = row.state === 'replied' || row.state === 'dropped';
  const linkClass = buttonStyles({ variant: 'secondary', size: 'md' });

  async function copy() {
    try {
      await navigator.clipboard.writeText(row.draft ?? '');
      setCopied(true);
    } catch {
      setError('Could not copy. Select the text and copy it instead.');
    }
  }

  async function send(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/sessions/${row.sessionId}/followup/${path}`, 'POST', body);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.followup}>
      <div className="flex items-baseline justify-between gap-3">
        <Link
          href={`/sessions/${row.sessionId}/edit`}
          className="text-ink min-w-0 text-base font-semibold wrap-anywhere underline-offset-4 hover:underline"
        >
          {who}
        </Link>
        <span className="text-ink-3 max-w-[40%] shrink-0 font-mono text-[11px]">
          Card {row.sequence} · {row.colour}
        </span>
      </div>
      <p className="text-ink mt-1 text-sm font-medium">{row.signal.label}</p>
      <p className="text-ink-3 mt-1 text-[13px]">{row.reason}</p>
      {row.draft ? (
        <p className="text-ink-2 mt-2 text-[14px] leading-snug wrap-anywhere whitespace-pre-line">
          {row.draft}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {row.draft ? (
          <FollowupSendButton
            draft={row.draft}
            pagePath={row.pagePath}
            email={row.prospectEmail}
            phone={row.prospectPhone}
            preferContact={row.preferContact}
          />
        ) : null}
        {row.draft ? (
          <Button type="button" variant="secondary" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        ) : null}
        {row.draft && row.channel === 'linkedin' && row.linkedinUrl ? (
          <a href={row.linkedinUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            Open LinkedIn
          </a>
        ) : null}
        {row.draft && row.channel === 'email' && row.prospectEmail ? (
          <a
            href={`mailto:${row.prospectEmail}?body=${encodeURIComponent(row.draft)}`}
            className={linkClass}
          >
            Open email
          </a>
        ) : null}
        {row.draft && isPersonalAddress(row.prospectEmail) ? (
          <p className="text-ink-3 basis-full text-[13px]">
            A personal address: only write if they asked to hear from you.
          </p>
        ) : null}
        {!row.draft && row.linkedinUrl ? (
          <a href={row.linkedinUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            Open LinkedIn
          </a>
        ) : null}
        {waiting || row.state === 'review' ? (
          <Button type="button" onClick={() => send('sent')} disabled={busy} className="ml-auto">
            {busy ? 'Saving…' : 'Done'}
          </Button>
        ) : null}
        {closed ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => send('outcome', { outcome: 'reopen' })}
            className="ml-auto"
          >
            Undo
          </Button>
        ) : (
          <details className="basis-full">
            <summary className="text-ink-2 inline-flex min-h-11 cursor-pointer items-center text-sm">
              More
            </summary>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => send('outcome', { outcome: 'replied' })}
              >
                They replied
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => send('outcome', { outcome: 'dropped' })}
              >
                Drop this contact
              </Button>
            </div>
          </details>
        )}
      </div>
      {error ? <p className="text-warn mt-2 text-[13px]">{error}</p> : null}
    </div>
  );
}
