'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, buttonStyles } from '@/components/ui/button';
import { ApiError, apiGet, apiSend } from '@/lib/http/client';
import type { ScreenQr, ScreenQrStatus } from '@/lib/cards/screen';
import { keepScreenAwake, pollScreenQr } from '@/lib/browser/screen-qr';
import { printedCode } from '@/lib/cards/issue-batch';

export function ShowQr() {
  const router = useRouter();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const capture = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<ScreenQr | null>(null);
  const [expired, setExpired] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState<'limited' | 'setup' | null>(null);

  async function issue() {
    setBusy(true);
    setQr(null);
    setExpired(false);
    setSessionId(null);
    setError('');
    setErrorKind(null);
    setOpen(true);
    try {
      setQr(await apiSend<ScreenQr>('/api/cards/screen', 'POST', {}));
    } catch (caught) {
      const kind =
        caught instanceof ApiError && caught.status === 429
          ? 'limited'
          : caught instanceof ApiError && caught.message === 'profile_incomplete'
            ? 'setup'
            : null;
      setErrorKind(kind);
      setError(
        kind === 'limited'
          ? 'You have shown a lot of QR codes. Try again in an hour.'
          : kind === 'setup'
            ? ''
            : 'Could not show a QR. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function checkAgain() {
    if (!qr || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiGet<ScreenQrStatus>(
        `/api/cards/screen/${encodeURIComponent(qr.code)}`,
      );
      if (result.status === 'scanned') setSessionId(result.sessionId);
    } catch {
      setError('Could not check for a scan. Try again.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) {
      dialog.current?.close();
      return;
    }
    dialog.current?.showModal();
    return keepScreenAwake();
  }, [open]);

  useEffect(() => {
    if (!open || !qr) return;
    return pollScreenQr(qr.code, {
      expiresAt: Date.parse(qr.expiresAt),
      onScanned: setSessionId,
      onExpired: () => setExpired(true),
    });
  }, [open, qr]);

  useEffect(() => {
    if (sessionId) capture.current?.focus();
  }, [sessionId]);

  function done() {
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="mt-4">
      <Button
        size="block"
        aria-label="Show QR for a new contact"
        disabled={busy}
        onClick={() => void issue()}
      >
        Show QR
      </Button>
      <p className="text-ink-3 mt-1.5 text-center text-sm">For a new contact. No card needed.</p>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onCancel={done}
        onClose={() => setOpen(false)}
        className="bg-bg text-ink fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto border-0 p-6"
      >
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center gap-5 pb-[env(safe-area-inset-bottom)] text-center">
          <h2 id={titleId} className="text-2xl font-semibold">
            Scan to get your page
          </h2>
          <div className="w-full" role="status" aria-live="polite">
            {busy ? (
              <p>{qr ? 'Checking for a scan…' : 'Getting your QR ready…'}</p>
            ) : sessionId ? (
              <Link
                ref={capture}
                href={`/sessions/${sessionId}/edit?registered=1`}
                className={buttonStyles({ size: 'block' })}
              >
                Scanned. Add their details
              </Link>
            ) : expired ? (
              <p className="text-lg font-medium">This QR has expired. Show a new one.</p>
            ) : qr ? (
              <>
                <p className="mb-4">Ask your contact to scan this with their camera.</p>
                <div
                  role="img"
                  aria-label={`QR code for card ${printedCode(qr.code)}`}
                  className="mx-auto w-full max-w-88 overflow-hidden rounded-xl bg-white [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: qr.svg }}
                />
                <p className="mt-4 font-mono text-xl tracking-widest">{printedCode(qr.code)}</p>
              </>
            ) : null}
          </div>
          {error ? <p role="alert">{error}</p> : null}
          {errorKind === 'setup' ? (
            <p role="alert">
              <Link href="/settings" className="underline underline-offset-2">
                Add your name in Setup first
              </Link>
            </p>
          ) : null}
          {expired && !sessionId ? (
            <Button disabled={busy} onClick={() => void checkAgain()}>
              Check again
            </Button>
          ) : null}
          {(expired || (error && !qr && !errorKind)) && !sessionId ? (
            <Button disabled={busy} onClick={() => void issue()}>
              {expired ? 'Show QR' : 'Try again'}
            </Button>
          ) : null}
          <Button autoFocus variant="secondary" className="w-full" onClick={done}>
            Done
          </Button>
        </div>
      </dialog>
    </div>
  );
}
