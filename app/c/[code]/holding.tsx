'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, apiSend } from '@/lib/http/client';
import { pollLandingStatus } from '@/lib/browser/landing-poll';
import { keepVisible } from '@/lib/capture/chips';

export type HoldingDetails = {
  ready: boolean;
  problems: string[];
  picked: string[];
  expiresAt: number | null;
};

export function Holding({
  code,
  first,
  details,
}: {
  code: string;
  first: string;
  details: HoldingDetails;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState(() =>
    keepVisible(details.picked, details.problems).slice(0, 2),
  );
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const remaining =
      details.expiresAt === null ? 600000 : Math.max(0, details.expiresAt - Date.now());
    return pollLandingStatus(code, {
      intervalMs: 4000,
      timeoutMs: Math.min(600000, remaining),
      onStatus: (status) => {
        // The first response can arrive before after() has filed the tap.
        if (
          details.ready
            ? status !== 'holding'
            : status === 'holding' ||
              status === 'working' ||
              status === 'completed' ||
              status === 'held' ||
              status === 'failed'
        ) {
          setClosed(true);
          router.refresh();
          return true;
        }
        return false;
      },
      onTimeout: () => {
        if (details.expiresAt !== null && Date.now() >= details.expiresAt) {
          setClosed(true);
          router.refresh();
        } else setGaveUp(true);
      },
    });
  }, [code, details.ready, details.expiresAt, router]);

  async function save(body: { problems: string[] } | { contact: string; consent: true }) {
    setBusy(true);
    setError('');
    try {
      await apiSend(`/api/landing/${encodeURIComponent(code)}/answers`, 'POST', body);
      if ('problems' in body) setPicked(body.problems);
      else {
        setContact('');
        setMessage('Saved. You can remove your details below.');
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setClosed(true);
        router.refresh();
      } else {
        setError(
          caught instanceof ApiError && caught.status === 400
            ? 'Please enter an email address or a UK mobile number.'
            : 'Could not save just now. Please try again in a moment.',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-line mt-5 space-y-6 border-b pb-6" aria-label="Your conversation">
      <p className="text-ink-2 text-base leading-relaxed" role="status">
        {gaveUp
          ? 'Tap the card again later and your note will be here.'
          : `${first} is writing you a note about your conversation. It will appear here.`}
      </p>
      {!closed && details.ready ? (
        <>
          {details.problems.length > 0 ? (
            <fieldset disabled={busy}>
              <legend className="text-ink text-base font-medium">
                What matters most to you right now?
              </legend>
              <p className="text-ink-3 mt-1 text-[13px]">Choose up to two.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {details.problems.slice(0, 6).map((problem) => {
                  const selected = picked.includes(problem);
                  return (
                    <button
                      key={problem}
                      type="button"
                      aria-pressed={selected}
                      disabled={!selected && picked.length >= 2}
                      onClick={() =>
                        void save({
                          problems: selected
                            ? picked.filter((p) => p !== problem)
                            : [...picked, problem],
                        })
                      }
                      className={`min-h-11 max-w-full rounded-full border px-4 py-2 text-left text-sm wrap-anywhere disabled:opacity-50 ${selected ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-2'}`}
                    >
                      {problem}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save({ contact, consent: true });
            }}
          >
            <label htmlFor="prospect-contact" className="text-ink block text-base font-medium">
              Send it to me
            </label>
            <input
              id="prospect-contact"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              required
              aria-describedby="prospect-consent"
              placeholder="Email address or UK mobile"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              className="border-line bg-surface text-ink mt-3 h-11 w-full min-w-0 rounded-md border px-3 text-base"
            />
            <p id="prospect-consent" className="text-ink-3 mt-2 text-[13px] leading-relaxed">
              {first} will use this only to send you this note. You can remove it any time.{' '}
              <Link href="/privacy" className="underline underline-offset-2">
                Privacy
              </Link>
            </p>
            <button
              type="submit"
              disabled={busy}
              className="border-line text-ink mt-3 min-h-11 rounded-md border px-4 text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Send it to me'}
            </button>
          </form>
        </>
      ) : null}
      {message ? (
        <p className="text-ink-3 text-sm" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-crit text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
