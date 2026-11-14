'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, apiGet, apiSend } from '@/lib/http/client';
import { pollLandingStatus } from '@/lib/browser/landing-poll';
import { keepVisible } from '@/lib/capture/chips';
import styles from '@/app/ui-slice.module.css';

export type HoldingDetails = {
  ready: boolean;
  readOnly?: boolean;
  problems: string[];
  picked: string[];
  expiresAt: number | null;
};

type Answers = { picked: string[]; readOnly: boolean; contact?: string | null };

export function Holding({
  code,
  first,
  details,
  children,
}: {
  code: string;
  first: string;
  details: HoldingDetails;
  /** The page's one action and the quiet "About" row, shown under the form. */
  children?: React.ReactNode;
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
  const [readOnly, setReadOnly] = useState(details.readOnly ?? false);
  // The page cannot see the answer token (its cookie is scoped to the answers route), so
  // "answered" on first paint only means "someone answered". Say nothing until the route
  // has told this browser whether it is the one that answered.
  const [checked, setChecked] = useState(!details.readOnly);
  const [saved, setSaved] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [expired, setExpired] = useState(false);
  const [noteReady, setNoteReady] = useState(false);
  const editing = useRef({ contact: '', focused: false, busy: false });

  const recheck = useRef<() => Promise<void>>(async () => {});

  const answersUrl = `/api/landing/${encodeURIComponent(code)}/answers`;
  useEffect(() => {
    let cancelled = false;
    if (details.ready)
      void apiGet<Answers>(answersUrl)
        .then((answers) => {
          if (cancelled || editing.current.busy) return;
          setPicked(keepVisible(answers.picked, details.problems).slice(0, 2));
          setReadOnly(answers.readOnly);
          setSaved(answers.contact ?? null);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setChecked(true);
        });
    return () => {
      cancelled = true;
    };
  }, [answersUrl, details.ready, details.problems]);

  useEffect(() => {
    const remaining =
      details.expiresAt === null ? 600000 : Math.max(0, details.expiresAt - Date.now());
    let stopped = false;
    let checking = false;
    const onStatus = (status: string, afterEditing = false) => {
      // The first response can arrive before after() has filed the tap.
      if (
        details.ready
          ? status !== 'holding'
          : ['holding', 'working', 'completed', 'held', 'failed'].includes(status)
      ) {
        if (editing.current.busy) return false;
        if (editing.current.contact) {
          if (afterEditing && status === 'portfolio') {
            setExpired(true);
            setGaveUp(true);
            setMessage('You can still copy what you typed and send it to them.');
          } else if (afterEditing) {
            setGaveUp(false);
            setNoteReady(true);
            setMessage(`${first}'s note is ready. You can still copy this and send it to them.`);
          }
          return false;
        }
        if (editing.current.focused && !afterEditing) return false;
        setClosed(true);
        router.refresh();
        return true;
      }
      return false;
    };
    recheck.current = async () => {
      if (!stopped || checking || editing.current.busy) return;
      checking = true;
      try {
        const { status } = await apiGet<{ status: string }>(
          `/api/landing/${encodeURIComponent(code)}/status`,
        );
        onStatus(status, true);
      } catch {
        // Keep the draft available if this final check is offline.
      } finally {
        checking = false;
      }
    };
    return pollLandingStatus(code, {
      intervalMs: 4000,
      timeoutMs: Math.min(600000, remaining),
      onStatus,
      onTimeout: () => {
        stopped = true;
        if (details.expiresAt !== null && Date.now() >= details.expiresAt) {
          if (!editing.current.contact && !editing.current.focused && !editing.current.busy) {
            setClosed(true);
            router.refresh();
          }
        } else setGaveUp(true);
      },
    });
  }, [code, details.ready, details.expiresAt, first, router]);

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
        setChanging(false);
        try {
          setSaved((await apiGet<Answers>(answersUrl)).contact ?? null);
        } catch {
          setMessage('Saved. You can remove your details below.');
        }
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
          const answers = await apiGet<Answers>(answersUrl);
          setPicked(keepVisible(answers.picked, details.problems).slice(0, 2));
          setReadOnly(answers.readOnly);
          setChecked(true);
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
      void recheck.current();
    }
  }

  return (
    <section className={styles.holding} aria-label="Your conversation">
      <h1 className={styles.holdLine} aria-live="polite">
        {gaveUp
          ? 'Not written yet. Keep the card and tap it again later.'
          : `${first}'s note about your conversation appears here once it's written.`}
      </h1>
      {!closed && details.ready && checked ? (
        readOnly ? (
          <p className={styles.holdQuiet} role="status">
            Answers have already been given on this card.
          </p>
        ) : (
          <>
            {details.problems.length > 0 ? (
              <fieldset className={styles.holdBlock} disabled={busy || noteReady || expired}>
                <legend>What matters most to you right now?</legend>
                <p className={styles.holdHint}>Choose up to two.</p>
                <div className={styles.chips}>
                  {details.problems.slice(0, 5).map((problem) => {
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
                        className={styles.chip}
                      >
                        {problem}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
            {saved && !changing ? (
              <div className={styles.holdBlock} role="status">
                <p className={styles.holdLabel}>Saved: {saved}</p>
                <p className={styles.holdHint}>
                  {first} will send you the note. You can remove it any time below.
                </p>
                <button type="button" onClick={() => setChanging(true)} className={styles.holdLink}>
                  Change
                </button>
              </div>
            ) : (
              <form
                className={styles.holdBlock}
                onSubmit={(event) => {
                  event.preventDefault();
                  void save({ contact, consent: true });
                }}
              >
                <label htmlFor="prospect-contact" className={styles.holdLabel}>
                  Want it sent to you?
                </label>
                <p id="prospect-contact-help" className={styles.holdHint}>
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
                    void recheck.current();
                  }}
                  onChange={(event) => {
                    editing.current.contact = event.target.value;
                    setContact(event.target.value);
                    if (!event.target.value) void recheck.current();
                  }}
                  className={styles.holdInput}
                />
                <p id="prospect-consent" className={styles.holdHint}>
                  {first} will use this only to send you this note. You can remove it any time.{' '}
                  <Link href="/privacy">Privacy</Link>
                </p>
                {!noteReady && !expired ? (
                  <button type="submit" disabled={busy} className={styles.holdSubmit}>
                    {busy ? 'Saving…' : 'Send it to me'}
                  </button>
                ) : null}
              </form>
            )}
          </>
        )
      ) : null}
      {message ? (
        <p className={styles.holdQuiet} role="status">
          {message}
        </p>
      ) : null}
      {noteReady ? (
        <button type="button" onClick={() => router.refresh()} className={styles.holdSubmit}>
          Read {first}&apos;s note
        </button>
      ) : null}
      {error ? (
        <p className={styles.holdError} role="alert">
          {error}
        </p>
      ) : null}
      {children}
    </section>
  );
}
