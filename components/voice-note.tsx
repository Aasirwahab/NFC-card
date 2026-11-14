'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, X } from 'lucide-react';
import styles from '@/app/ui-slice.module.css';
import { toWav16kMono } from '@/lib/browser/wav';
import { MAX_SECONDS } from '@/lib/capture/voice';
import { ApiError, apiUpload } from '@/lib/http/client';

export const VOICE_TIP = 'Tip: tap the mic on your keyboard and say it.';

/**
 * "Say it once": press, talk for up to a minute, stop. The words come back as text
 * for the note box; the caller reads the note exactly as if it had been typed. The
 * recording lives only in memory here and is dropped after the call. When this
 * browser cannot record, or the rep says no to the microphone, it calls
 * onUnavailable and the caller falls back to the keyboard tip.
 */
export function VoiceNote({
  onText,
  onUnavailable,
  onBusy,
}: {
  /** Returns false when the note box has no room, so the words are held here instead. */
  onText: (text: string) => boolean;
  onUnavailable: () => void;
  /** True while recording or turning speech into words, so the form can wait to save. */
  onBusy: (busy: boolean) => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'asking' | 'recording' | 'sending'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const cancelled = useRef(false);
  const mounted = useRef(false);
  // Set synchronously, before the permission prompt, so a second tap cannot start a second request.
  const starting = useRef(false);
  // Kept in memory until it works or the rep drops it, so a failed call loses nothing.
  const held = useRef<Blob | null>(null);
  const [retry, setRetry] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => onBusy(phase !== 'idle'), [phase, onBusy]);

  useEffect(() => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onBusy(false);
      onUnavailable();
    }
  }, [onBusy, onUnavailable]);

  // Leaving the screen mid-recording must release the microphone.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelled.current = true;
      if (recorder.current?.state === 'recording') recorder.current.stop();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'recording') return;
    const started = Date.now();
    // A suspended tab stops the clock being trustworthy: end the take as the rep leaves.
    const away = () => {
      if (document.visibilityState === 'hidden') recorder.current?.stop();
    };
    document.addEventListener('visibilitychange', away);
    window.addEventListener('pagehide', away);
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) recorder.current?.stop();
    }, 250);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', away);
      window.removeEventListener('pagehide', away);
    };
  }, [phase]);

  async function start() {
    if (starting.current || recorder.current?.state === 'recording') return;
    starting.current = true;
    setPhase('asking');
    setMessage(null);
    held.current = null;
    setRetry(false);
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // The rep left while the permission prompt was open: do not record.
      if (!mounted.current || (recorder.current as MediaRecorder | null)?.state === 'recording') {
        starting.current = false;
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const activeStream = stream;
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      recorder.current = rec;
      cancelled.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        activeStream.getTracks().forEach((t) => t.stop());
        if (cancelled.current) return setPhase('idle');
        held.current = new Blob(chunks, { type: rec.mimeType });
        void send();
      };
      setSeconds(0);
      setPhase('recording');
      rec.start();
      starting.current = false;
    } catch {
      starting.current = false;
      cancelled.current = true;
      stream?.getTracks().forEach((track) => track.stop());
      recorder.current = null;
      if (mounted.current) {
        setPhase('idle');
        onBusy(false);
        onUnavailable();
      }
    }
  }

  async function send() {
    if (!held.current) return;
    setPhase('sending');
    setRetry(false);
    setMessage(null);
    try {
      const wav = await toWav16kMono(held.current);
      const { text } = await apiUpload<{ text: string }>(
        '/api/capture/transcribe',
        new Blob([wav as BlobPart], { type: 'audio/wav' }),
      );
      held.current = null;
      if (!text.trim()) setMessage('Did not catch any words. Try again, a little closer.');
      else if (!onText(text)) setPending(text);
    } catch (error) {
      const code = error instanceof ApiError ? error.message : '';
      if (code === 'model_not_configured') {
        held.current = null;
        setMessage(VOICE_TIP);
      } else if (code === 'rate_limited') {
        setRetry(true);
        setMessage('That is a lot of voice notes. Wait a few minutes, then tap Try again.');
      } else {
        setRetry(true);
        setMessage('Could not turn that into words. Your recording is kept: tap Try again.');
      }
    } finally {
      setPhase('idle');
    }
  }

  function cancel() {
    cancelled.current = true;
    recorder.current?.stop();
  }

  const mmss = `0:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="mt-4">
      {phase === 'recording' ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => recorder.current?.stop()}
            className={styles.scanButton}
            aria-label={`Stop and use this recording, ${seconds} seconds`}
          >
            <Square className="h-5 w-5" aria-hidden="true" />
            Stop
            <span className="font-mono text-sm tabular-nums" aria-hidden="true">
              {mmss} / 1:00
            </span>
          </button>
          <button
            type="button"
            onClick={cancel}
            className="text-ink-2 inline-flex min-h-12 items-center gap-1 px-3 text-sm font-medium underline underline-offset-2"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={phase === 'sending' || phase === 'asking'}
          onClick={() => void start()}
          className={styles.scanButton}
        >
          <Mic className="h-5 w-5" aria-hidden="true" />
          {phase === 'sending' ? 'Writing it down…' : 'Say it once'}
        </button>
      )}
      {retry && phase === 'idle' ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void send()} className={styles.scanButton}>
            Try again
          </button>
          <button
            type="button"
            onClick={() => {
              held.current = null;
              setRetry(false);
              setMessage(null);
            }}
            className="text-ink-2 min-h-12 px-3 text-sm font-medium underline underline-offset-2"
          >
            Discard
          </button>
        </div>
      ) : null}
      {pending ? (
        <div className="border-accent/40 mt-2 rounded-xl border p-3">
          <p className="text-ink text-[13px] font-semibold">
            Your note is full. Shorten it, then add this.
          </p>
          <p className="text-ink-2 mt-1 text-sm wrap-anywhere">{pending}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (onText(pending)) setPending(null);
              }}
              className={styles.scanButton}
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="text-ink-2 min-h-12 px-3 text-sm font-medium underline underline-offset-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <p className="text-ink-2 mt-2 text-[13px]" role="status">
        {phase === 'recording' ? 'Recording. Say what they told you, then tap Stop.' : message}
      </p>
    </div>
  );
}
