'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/field';
import { apiSend } from '@/lib/http/client';
import { cn } from '@/lib/cn';

/**
 * The rep's tools above the preview (spec §14.5): edit the pitch, go back to the
 * generated one, and rate what TapLead wrote.
 *
 * Editing is optional and never asked for. The whole design assumes reps will not
 * review anything at an event; this is for the rep who looks and wants to fix one
 * line.
 */

type Rating = { rating: number; reason: string | null };
type Warning = { check: string; detail: string };

const BLOCKED_MESSAGES: Record<string, string> = {
  echoes_note:
    'That repeats something from your private note. It stays private — take it out and save again.',
  empty: 'The pitch cannot be empty.',
};

export function PitchTools({
  sessionId,
  shownPitch,
  edited,
  canRate,
  rating: initialRating,
}: {
  sessionId: string;
  shownPitch: string;
  edited: boolean;
  canRate: boolean;
  rating: Rating | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(shownPitch);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<Warning[] | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiSend<{ warnings: Warning[] }>(
        `/api/sessions/${sessionId}/pitch`,
        'PUT',
        { text },
      );
      setWarnings(result.warnings);
      setEditing(false);
      router.refresh();
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : '';
      setError(BLOCKED_MESSAGES[code] ?? 'Could not save the pitch. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!confirm('Go back to the pitch TapLead wrote? Your edit will be discarded.')) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/sessions/${sessionId}/pitch`, 'DELETE');
      setWarnings(null);
      router.refresh();
    } catch {
      setError('Could not reset the pitch. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 flex flex-col gap-3">
      {edited ? (
        <div className="bg-accent-soft text-ink-2 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm">
          <span>You edited this pitch. It stays yours, even if the page is regenerated.</span>
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="text-accent font-medium underline underline-offset-2"
          >
            Use TapLead&rsquo;s version
          </button>
        </div>
      ) : null}

      {editing ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="pitch" className="text-ink-2 text-sm font-medium">
            The pitch
          </label>
          <p className="text-ink-3 -mt-1 text-[13px]">
            The greeting (&ldquo;Hi Tom,&rdquo;) is added for you. Leave a blank line between
            paragraphs.
          </p>
          <Textarea
            id="pitch"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            className="text-[15px] leading-relaxed"
          />
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy || !text.trim()}>
              {busy ? 'Saving…' : 'Save pitch'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(false);
                setText(shownPitch);
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            // Start from what is on the page now, not from an earlier edit.
            setText(shownPitch);
            setEditing(true);
          }}
          className="self-start"
        >
          Edit the pitch
        </Button>
      )}

      {error ? (
        <p className="bg-crit-bg text-crit rounded-lg px-3 py-2.5 text-sm font-medium" role="alert">
          {error}
        </p>
      ) : null}

      {warnings && warnings.length > 0 ? (
        <div className="bg-warn-bg text-warn rounded-lg px-3 py-2.5 text-sm" role="status">
          <p className="font-medium">Saved. A few things worth a second look:</p>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w) => (
              <li key={`${w.check}:${w.detail}`}>{w.detail}</li>
            ))}
          </ul>
        </div>
      ) : warnings ? (
        <p className="bg-ok-bg text-ok rounded-lg px-3 py-2.5 text-sm font-medium" role="status">
          Saved. This is what they will see.
        </p>
      ) : null}

      {canRate ? <RatePitch sessionId={sessionId} initial={initialRating} /> : null}
    </section>
  );
}

/**
 * Thumbs up or down on the pitch TapLead wrote — not on the rep's own edit.
 * Until real pitches are judged by people who were in the room, the prompts are
 * tuned blind (§14.5).
 */
function RatePitch({ sessionId, initial }: { sessionId: string; initial: Rating | null }) {
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [reason, setReason] = useState(initial?.reason ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function send(value: number, why: string) {
    setStatus('saving');
    try {
      await apiSend(`/api/sessions/${sessionId}/pitch/rating`, 'POST', {
        rating: value,
        reason: why.trim() || undefined,
      });
      setRating(value);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  const choice = (value: 1 | -1, label: string, Icon: typeof ThumbsUp) => (
    <button
      type="button"
      onClick={() => send(value, reason)}
      disabled={status === 'saving'}
      aria-pressed={rating === value}
      className={cn(
        'flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium',
        rating === value
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <div className="border-line-soft flex flex-col gap-2 border-t pt-3">
      <p className="text-ink-2 text-sm font-medium">How good is the pitch TapLead wrote?</p>
      <div className="flex flex-wrap gap-2">
        {choice(1, 'Good', ThumbsUp)}
        {choice(-1, 'Not right', ThumbsDown)}
      </div>

      {rating === -1 ? (
        <div className="flex gap-2">
          <Input
            id="rating-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="What was wrong? (optional)"
            className="h-11 text-[15px]"
          />
          <Button
            variant="secondary"
            onClick={() => send(-1, reason)}
            disabled={status === 'saving'}
          >
            Save
          </Button>
        </div>
      ) : null}

      {status === 'saved' ? (
        <p className="text-ok text-[13px]" role="status">
          Thanks — that helps tune the pitches.
        </p>
      ) : status === 'error' ? (
        <p className="text-crit text-[13px]" role="alert">
          Could not save that. Try again.
        </p>
      ) : null}
    </div>
  );
}
