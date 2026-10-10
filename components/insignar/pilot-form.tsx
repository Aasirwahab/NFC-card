'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { apiSend } from '@/lib/http/client';
import { pilot } from '@/app/(marketing)/insignar/copy';

type Status = 'idle' | 'sending' | 'success' | 'error';

export function PilotForm() {
  const [status, setStatus] = useState<Status>('idle');
  const busy = useRef(false); // ref guard: blocks a second submit before state re-renders
  const f = pilot.form;
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setStatus('sending');
    const form = e.currentTarget;
    try {
      const data = await apiSend<{ ok?: boolean }>(
        '/api/insignar/pilot',
        'POST',
        Object.fromEntries(new FormData(form)),
      );
      if (!data.ok) throw new Error('rejected');
      form.reset();
      setStatus('success');
    } catch {
      setStatus('error');
    } finally {
      busy.current = false;
    }
  };
  const msg = status === 'success' ? f.success : status === 'error' ? f.error : '';
  return (
    <form className="pf" onSubmit={onSubmit}>
      <label>
        {f.name}
        <input name="name" autoComplete="name" required maxLength={100} />
      </label>
      <label>
        {f.email}
        <input name="email" type="email" autoComplete="email" required maxLength={254} />
      </label>
      <label>
        {f.company}
        <input name="company" autoComplete="organization" required maxLength={120} />
      </label>
      <label>
        {f.reps}
        <input name="reps" inputMode="numeric" pattern="[0-9]*" maxLength={4} />
      </label>
      <button type="submit" className="btn" disabled={status === 'sending'}>
        {status === 'sending' ? f.sending : f.submit}
      </button>
      <small>{f.privacyLine}</small>
      <p className="msg" role="status" aria-live="polite">
        {msg}
      </p>
      <small>
        <Link href="/privacy">{f.privacy}</Link>
      </small>
    </form>
  );
}
