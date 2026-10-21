'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ApiError, apiSend } from '@/lib/http/client';

/**
 * Shown only to reps who review before a page goes live. Until they approve,
 * their prospect sees the warm pending page; writing their own pitch also counts.
 */
export function ApprovePitch({
  sessionId,
  approved,
  seenRevision,
}: {
  sessionId: string;
  approved: boolean;
  /** The details revision of the pitch on screen; a newer run must be read first. */
  seenRevision: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/sessions/${sessionId}/pitch/approve`, 'POST', {
        approved: next,
        seenRevision,
      });
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.message === 'pitch_changed') {
        setError('A newer version has just been written. Read it below, then approve.');
        router.refresh();
      } else {
        setError('Could not save that. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-line bg-surface mt-4 rounded-xl border p-4" role="status">
      <p className="text-ink text-sm font-medium">
        {approved
          ? 'Live: your prospect sees this page.'
          : 'Waiting for you: your prospect sees a short holding page until you approve.'}
      </p>
      <div className="mt-3 flex gap-2">
        {approved ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void set(false)}>
            Take it back
          </Button>
        ) : (
          <Button type="button" disabled={busy} onClick={() => void set(true)}>
            {busy ? 'Publishing…' : 'Approve and publish'}
          </Button>
        )}
      </div>
      {error ? <p className="text-danger mt-2 text-sm">{error}</p> : null}
    </div>
  );
}
