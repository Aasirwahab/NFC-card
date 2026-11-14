'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, buttonStyles } from '@/components/ui/button';
import { ApiError, apiSend } from '@/lib/http/client';
import type { ScreenQr } from '@/lib/cards/screen';
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

  async function issue() {
    setBusy(true);
    setQr(null);
    setExpired(false);
    setSessionId(null);
    setError('');
    setOpen(true);
    try {
      setQr(await apiSend<ScreenQr>('/api/cards/screen', 'POST', {}));
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 429
          ? 'You have shown a lot of QR codes. Try again in an hour.'
          : 'Could not show a QR. Try again.',
      );
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
            Show QR
          </h2>
          <div className="w-full" role="status" aria-live="polite">
            {busy ? (
              <p>Getting your QR ready…</p>
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
          {(expired || error) && !sessionId ? (
            <Button disabled={busy} onClick={() => void issue()}>
              Show QR
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
