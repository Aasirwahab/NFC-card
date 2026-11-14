'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, apiGet, apiSend } from '@/lib/http/client';
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
  const [readOnly, setReadOnly] = useState(false);
  const [expired, setExpired] = useState(false);
  const [noteReady, setNoteReady] = useState(false);
  const editing = useRef({ contact: '', focused: false, busy: false });

  const answersUrl = `/api/landing/${encodeURIComponent(code)}/answers`;
  useEffect(() => {
    let cancelled = false;
    if (details.ready)
      void apiGet<{ picked: string[]; readOnly: boolean }>(answersUrl)
        .then((answers) => {
          if (cancelled || editing.current.busy) return;
          setPicked(keepVisible(answers.picked, details.problems).slice(0, 2));
          setReadOnly(answers.readOnly);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [answersUrl, details.ready, details.problems]);

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
          if (editing.current.contact || editing.current.focused || editing.current.busy)
            return false;
          setClosed(true);
          router.refresh();
          return true;
        }
        return false;
      },
      onTimeout: () => {
        if (details.expiresAt !== null && Date.now() >= details.expiresAt) {
          if (!editing.current.contact && !editing.current.focused && !editing.current.busy) {
            setClosed(true);
            router.refresh();
          }
        } else setGaveUp(true);
      },
    });
  }, [code, details.ready, details.expiresAt, router]);

  async function save(body: { problems: string[] } | { contact: string; consent: true }) {
    editing.current.busy = true;
    setBusy(true);
    setError('');
    try {
      await apiSend(`/api/landing/${encodeURIComponent(code)}/answers`, 'POST', body);
      if ('problems' in body) setPicked(body.problems);
      else {
        editing.current.contact = '';
        setContact('');
        setMessage('Saved. You can remove your details below.');
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        if (caught.message === 'holding_expired') {
          setExpired(true);
          setGaveUp(true);
          setMessage('You can still copy what you typed and send it to them.');
          return;
        }
        try {
          const answers = await apiGet<{ picked: string[]; readOnly: boolean }>(answersUrl);
          setPicked(keepVisible(answers.picked, details.problems).slice(0, 2));
          setReadOnly(answers.readOnly);
          if (answers.readOnly) setMessage('Answers have already been given on this card.');
        } catch (readError) {
          if (readError instanceof ApiError && readError.status === 409) {
            if (editing.current.contact) {
              setNoteReady(true);
              setMessage(`${first}'s note is ready. You can still copy this and send it to them.`);
            } else {
              setClosed(true);
              router.refresh();
            }
          } else setError('Could not check just now. Please try again in a moment.');
        }
      } else {
        setError(
          caught instanceof ApiError && caught.status === 400
            ? 'Please enter an email address or a UK mobile number.'
            : 'Could not save just now. Please try again in a moment.',
        );
      }
    } finally {
      editing.current.busy = false;
      setBusy(false);
    }
  }

  return (
    <section className="border-line mt-5 space-y-6 border-b pb-6" aria-label="Your conversation">
      <p className="text-ink-2 text-base leading-relaxed" role="status">
        {gaveUp
          ? 'Not written yet. Keep the card and tap it again later.'
          : `${first}'s note about your conversation appears here once it's written.`}
      </p>
      {!closed && details.ready ? (
        <>
          {details.problems.length > 0 ? (
            <fieldset disabled={busy || readOnly || noteReady || expired}>
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
          {!readOnly ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save({ contact, consent: true });
              }}
            >
              <label htmlFor="prospect-contact" className="text-ink block text-base font-medium">
                Want it sent to you?
              </label>
              <p id="prospect-contact-help" className="text-ink-3 mt-1 text-[13px]">
                Leave your email or mobile and {first} will send you the note.
              </p>
              <input
                id="prospect-contact"
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
                required
                aria-describedby="prospect-contact-help prospect-consent"
                placeholder="Email address or UK mobile"
                value={contact}
                readOnly={noteReady || expired}
                onFocus={() => {
                  editing.current.focused = true;
                }}
                onBlur={() => {
                  editing.current.focused = false;
                }}
                onChange={(event) => {
                  editing.current.contact = event.target.value;
                  setContact(event.target.value);
                }}
                className="border-line bg-surface text-ink mt-3 h-11 w-full min-w-0 rounded-md border px-3 text-base"
              />
              <p id="prospect-consent" className="text-ink-3 mt-2 text-[13px] leading-relaxed">
                {first} will use this only to send you this note. You can remove it any time.{' '}
                <Link href="/privacy" className="underline underline-offset-2">
                  Privacy
                </Link>
              </p>
              {!noteReady && !expired ? (
                <button
                  type="submit"
                  disabled={busy}
                  className="border-line text-ink mt-3 min-h-11 rounded-md border px-4 text-sm font-medium disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Send it to me'}
                </button>
              ) : null}
            </form>
          ) : (
            <p className="text-ink-3 text-sm" role="status">
              Answers have already been given on this card.
            </p>
          )}
        </>
      ) : null}
      {message ? (
        <p className="text-ink-3 text-sm" role="status">
          {message}
        </p>
      ) : null}
      {noteReady ? (
        <button
          type="button"
          onClick={() => router.refresh()}
          className="border-line text-ink min-h-11 rounded-md border px-4 text-sm font-medium"
        >
          Read {first}&apos;s note
        </button>
      ) : null}
      {error ? (
        <p className="text-crit text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
