'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError, apiGet, apiSend } from '@/lib/http/client';
import { pollRequests } from '@/lib/browser/request-poll';
import {
  bestTimeLabels,
  channelLabels,
  normaliseRequestContact,
  requestChannels,
  requestConsent,
  type BestTime,
  type RequestChannel,
  type RequestKind,
} from '@/lib/domain/prospect-requests';
import styles from '@/app/ui-slice.module.css';
import requestStyles from '@/components/prospect-request.module.css';

type OpenRequest = {
  id: string;
  kind: RequestKind;
  channel: RequestChannel;
  best_time: BestTime | null;
  status: 'open';
};
type RequestStatus = {
  request: OpenRequest | null;
  contact: { email: string | null; phone: string | null } | null;
};

export function ProspectRequest({ code, first }: { code: string; first: string }) {
  const [request, setRequest] = useState<OpenRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RequestKind>('call');
  const [channel, setChannel] = useState<RequestChannel>('call');
  const [contact, setContact] = useState('');
  const [bestTime, setBestTime] = useState<BestTime | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const prefill = useRef<RequestStatus['contact']>(null);
  const dirty = useRef(false);
  const path = `/api/landing/${encodeURIComponent(code)}/answers/request`;

  useEffect(
    () =>
      open
        ? undefined
        : pollRequests<RequestStatus>(path, (status) => {
            setRequest(status.request);
            prefill.current = status.contact;
          }),
    [path, open],
  );
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  function prefilled(next: RequestChannel, value = prefill.current) {
    return (next === 'email' ? value?.email : value?.phone) ?? '';
  }
  function show(next: RequestKind) {
    const nextChannel =
      request?.channel ?? (next === 'call' ? 'call' : prefill.current?.email ? 'email' : 'text');
    setKind(next);
    setChannel(nextChannel);
    setContact(prefilled(nextChannel));
    setBestTime(request?.best_time ?? null);
    setChecked(false);
    setError('');
    dirty.current = false;
    setOpen(true);
    // The holding form may have saved since the last poll. Never replace typing.
    void apiGet<RequestStatus>(path)
      .then((status) => {
        prefill.current = status.contact;
        setRequest(status.request);
        if (!dirty.current) setContact(prefilled(nextChannel, status.contact));
      })
      .catch(() => {});
  }
  async function submit() {
    if (!checked || !normaliseRequestContact(channel, contact)) {
      setError(
        channel === 'email'
          ? 'Please enter your email address and confirm below.'
          : 'Please enter a UK mobile number and confirm below.',
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      const status = await apiSend<RequestStatus>(path, 'POST', {
        kind,
        channel,
        contact,
        bestTime,
        consent: true,
      });
      setRequest(status.request);
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 409
          ? 'This request has changed. Close this and try again.'
          : caught instanceof ApiError && caught.status === 400
            ? 'Please check your contact details and try again.'
            : 'Could not save just now. Please try again in a moment.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function withdraw() {
    if (!request) return;
    setBusy(true);
    setError('');
    try {
      await apiSend(path, 'DELETE', { requestId: request.id });
      setRequest(null);
      setOpen(false);
    } catch {
      setError('Could not cancel just now. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.holdBlock} aria-label="What would help next?">
      {request ? (
        <>
          <p className={styles.holdLabel} role="status">
            {first} has your request.
          </p>
          <button type="button" className={styles.holdLink} onClick={() => show(request.kind)}>
            View or cancel my request
          </button>
        </>
      ) : (
        <>
          <h2 className={styles.holdLabel}>What would help next?</h2>
          <div className="flex flex-wrap gap-x-4">
            <button
              type="button"
              className={`${styles.holdLink} max-w-full wrap-anywhere whitespace-normal`}
              onClick={() => show('call')}
            >
              Ask {first} to call me
            </button>
            <button type="button" className={styles.holdLink} onClick={() => show('details')}>
              Send me the details
            </button>
          </div>
        </>
      )}
      <dialog
        ref={dialog}
        className={requestStyles.sheet}
        aria-labelledby="request-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else setOpen(false);
        }}
        onClose={() => setOpen(false)}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="request-title" className="min-w-0 text-lg font-semibold wrap-anywhere">
            {kind === 'call' ? `Ask ${first} to call me` : 'Send me the details'}
          </h2>
          <button
            type="button"
            className={`${styles.holdLink} shrink-0`}
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <fieldset disabled={busy} className="mt-4">
            <legend className={styles.holdLabel}>How would you like to hear from {first}?</legend>
            <div className={styles.chips}>
              {requestChannels.map((option) => (
                <button
                  type="button"
                  key={option}
                  aria-pressed={channel === option}
                  className={styles.chip}
                  onClick={() => {
                    setChannel(option);
                    setChecked(false);
                    setError('');
                    if (option === 'email' || channel === 'email') setContact(prefilled(option));
                    dirty.current = true;
                  }}
                >
                  {channelLabels[option]}
                </button>
              ))}
            </div>
            <label htmlFor="request-contact" className={`${styles.holdLabel} mt-4 block`}>
              {channel === 'email' ? 'Email address' : 'UK mobile number'}
            </label>
            <input
              id="request-contact"
              className={styles.holdInput}
              type={channel === 'email' ? 'email' : 'tel'}
              autoComplete={channel === 'email' ? 'email' : 'tel'}
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={254}
              value={contact}
              onChange={(event) => {
                dirty.current = true;
                setContact(event.target.value);
              }}
              aria-describedby="request-consent"
            />
          </fieldset>
          <fieldset disabled={busy} className="mt-4">
            <legend className={styles.holdLabel}>
              Best time <span className={styles.holdHint}>(optional)</span>
            </legend>
            <div className={styles.chips}>
              {(Object.keys(bestTimeLabels) as BestTime[]).map((time) => (
                <button
                  type="button"
                  key={time}
                  className={styles.chip}
                  aria-pressed={bestTime === time}
                  onClick={() => setBestTime(bestTime === time ? null : time)}
                >
                  {bestTimeLabels[time]}
                </button>
              ))}
            </div>
          </fieldset>
          <label
            className="mt-5 flex min-h-11 items-start gap-3 text-sm leading-relaxed"
            id="request-consent"
          >
            <input
              type="checkbox"
              required
              disabled={busy}
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
              className="mt-1 h-5 w-5 shrink-0"
            />
            <span>{requestConsent(first, channel)}</span>
          </label>
          {error ? (
            <p className={styles.holdError} role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className={styles.holdSubmit} disabled={busy}>
            {busy ? 'Saving…' : 'Send my request'}
          </button>
        </form>
        {request ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void withdraw()}
            className={styles.holdLink}
          >
            Cancel my request
          </button>
        ) : null}
      </dialog>
    </section>
  );
}
