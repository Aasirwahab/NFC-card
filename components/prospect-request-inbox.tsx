'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, buttonStyles } from '@/components/ui/button';
import type { RepRequest } from '@/lib/db/requests';
import { channelLabels, bestTimeLabels } from '@/lib/domain/prospect-requests';
import { requestReplyLink } from '@/lib/followup/send';
import { pollRequests } from '@/lib/browser/request-poll';
import { apiGet, apiSend } from '@/lib/http/client';
import styles from './prospect-request.module.css';

export function ProspectRequestInbox({
  initial,
  sessionId,
}: {
  initial: RepRequest[];
  sessionId?: string;
}) {
  const [requests, setRequests] = useState(initial);
  const seen = useRef(new Set(initial.map((r) => r.id)));
  const [highlight, setHighlight] = useState<string[]>([]);
  const [error, setError] = useState('');
  const router = useRouter();
  const lastIds = useRef(initial.map((r) => r.id).join(','));
  const path = `/api/requests${sessionId ? `?contact=${encodeURIComponent(sessionId)}` : ''}`;
  useEffect(
    () =>
      pollRequests<{ requests: RepRequest[] }>(path, (value) => {
        setHighlight(value.requests.filter((r) => !seen.current.has(r.id)).map((r) => r.id));
        value.requests.forEach((r) => seen.current.add(r.id));
        setRequests(value.requests);
        const ids = value.requests.map((r) => r.id).join(',');
        if (lastIds.current !== ids) {
          lastIds.current = ids;
          router.refresh();
        }
      }),
    [path, router],
  );

  async function refresh() {
    try {
      setRequests((await apiGet<{ requests: RepRequest[] }>(path)).requests);
    } catch {
      /* Keep the last confirmed rows while offline. */
    }
  }

  async function done(row: RepRequest) {
    try {
      await apiSend(
        `/api/sessions/${encodeURIComponent(row.sessionId)}/requests/${encodeURIComponent(row.id)}/done`,
        'POST',
      );
      setRequests((rows) => rows.filter((r) => r.id !== row.id));
      router.refresh();
    } catch {
      setError('Could not save. Refresh to check the latest request.');
      await refresh();
    }
  }
  if (!requests.length && !error) return null;
  return (
    <section aria-label="Contact requests" className="mt-4 min-w-0">
      <div aria-live="polite" className="sr-only">
        {requests.length} open contact request{requests.length === 1 ? '' : 's'}
      </div>
      {requests.map((row) => (
        <RequestRow
          key={row.id}
          row={row}
          highlighted={highlight.includes(row.id)}
          onDone={() => done(row)}
          onStale={() => void refresh()}
        />
      ))}
      {error ? (
        <p role="alert" className="text-crit mt-2 text-sm">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function RequestRow({
  row,
  highlighted,
  onDone,
  onStale,
}: {
  row: RepRequest;
  highlighted: boolean;
  onDone: () => Promise<void>;
  onStale: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = row.prospectName?.trim() || 'This contact';
  async function open() {
    setBusy(true);
    setError('');
    try {
      // A cached row is not permission: recheck this exact request and channel.
      const current = await apiGet<{ requests: RepRequest[] }>(
        `/api/requests?contact=${encodeURIComponent(row.sessionId)}`,
      );
      const fresh = current.requests.find((request) => request.id === row.id);
      if (!fresh || fresh.channel !== row.channel || fresh.contact !== row.contact) {
        setOpened(false);
        setError('This request has changed or was cancelled. Refreshing the list.');
        onStale();
        return;
      }
      const link = requestReplyLink({
        channel: fresh.channel,
        contact: fresh.contact,
        prospectName: fresh.prospectName,
        repFullName: fresh.repFullName,
        businessName: fresh.businessName,
        eventName: fresh.eventName,
        pageUrl: new URL(fresh.pagePath, window.location.origin).href,
      });
      if (!link) {
        setError('Could not open this contact. Please check their details.');
        return;
      }
      setOpened(true);
      window.location.href = link.href;
    } catch {
      setError('Could not check this request. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`border-line border-b py-4 ${highlighted ? styles.newRequest : ''}`}>
      <p className="text-ink text-base font-semibold wrap-anywhere">
        <Link
          href={`/sessions/${encodeURIComponent(row.sessionId)}/edit`}
          className="underline-offset-4 hover:underline"
        >
          {name}
        </Link>
        {row.kind === 'call' ? ' asked you to call them' : ' asked you to send the details'}
        <span className="text-ink-2 font-normal">
          {' '}
          · {channelLabels[row.channel]}
          {row.bestTime ? ` · ${bestTimeLabels[row.bestTime].toLowerCase()}` : ''}
        </span>
      </p>
      <div className="mt-3 flex min-w-0 flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void open()}
          disabled={busy}
          className={buttonStyles({
            className: 'h-auto min-h-11 max-w-full py-2 text-left wrap-anywhere',
          })}
        >
          {row.channel === 'call'
            ? 'Call'
            : row.channel === 'email'
              ? 'Email'
              : row.channel === 'whatsapp'
                ? 'WhatsApp'
                : 'Text'}{' '}
          {row.contact}
        </button>
        {opened ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onDone();
              setBusy(false);
            }}
          >
            {busy ? 'Saving…' : 'Done'}
          </Button>
        ) : null}
      </div>
      {opened ? (
        <p className="text-ink-3 mt-2 text-sm">
          Tap Done after you have {row.channel === 'call' ? 'called' : 'sent it'}. Opening the app
          does not confirm it was sent.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-crit mt-2 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
