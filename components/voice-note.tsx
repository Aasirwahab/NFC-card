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
}: {
  onText: (text: string) => void;
  onUnavailable: () => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'sending'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onUnavailable();
    }
  }, [onUnavailable]);

  // Leaving the screen mid-recording must release the microphone.
  useEffect(
    () => () => {
      cancelled.current = true;
      if (recorder.current?.state === 'recording') recorder.current.stop();
    },
    [],
  );

  useEffect(() => {
    if (phase !== 'recording') return;
    const started = Date.now();
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) recorder.current?.stop();
    }, 250);
    return () => clearInterval(tick);
  }, [phase]);

  async function start() {
    setMessage(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onUnavailable();
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    recorder.current = rec;
    cancelled.current = false;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (cancelled.current) return setPhase('idle');
      void send(new Blob(chunks, { type: rec.mimeType }));
    };
    setSeconds(0);
    setPhase('recording');
    rec.start();
  }

  async function send(recording: Blob) {
    setPhase('sending');
    try {
      const wav = await toWav16kMono(recording);
      const { text } = await apiUpload<{ text: string }>(
        '/api/capture/transcribe',
        new Blob([wav as BlobPart], { type: 'audio/wav' }),
      );
      if (text.trim()) onText(text);
      else setMessage('Did not catch any words. Try again, a little closer.');
    } catch (error) {
      const code = error instanceof ApiError ? error.message : '';
      setMessage(
        code === 'rate_limited'
          ? 'That is a lot of voice notes. Try again in a few minutes, or type it.'
          : code === 'model_not_configured'
            ? VOICE_TIP
            : 'Could not turn that into words. Type it instead; nothing is lost.',
      );
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
          disabled={phase === 'sending'}
          onClick={() => void start()}
          className={styles.scanButton}
        >
          <Mic className="h-5 w-5" aria-hidden="true" />
          {phase === 'sending' ? 'Writing it down…' : 'Say it once'}
        </button>
      )}
      <p className="text-ink-2 mt-2 text-[13px]" role="status">
        {phase === 'recording' ? 'Recording. Say what they told you, then tap Stop.' : message}
      </p>
    </div>
  );
}
