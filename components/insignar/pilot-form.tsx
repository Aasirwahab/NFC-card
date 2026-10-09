'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { pilot } from '@/app/(marketing)/insignar/copy';

/** Demo only: handled in the browser. Nothing is sent, nothing is stored. */
export function PilotForm() {
  const [msg, setMsg] = useState('');
  const f = pilot.form;
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMsg(f.demo);
  };
  return (
    <form className="pf" onSubmit={onSubmit}>
      <label>
        {f.name}
        <input name="name" autoComplete="name" required />
      </label>
      <label>
        {f.email}
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        {f.company}
        <input name="company" autoComplete="organization" required />
      </label>
      <label>
        {f.reps}
        <input name="reps" inputMode="numeric" pattern="[0-9]*" />
      </label>
      <button type="submit" className="btn">
        {f.submit}
      </button>
      <p className="msg" role="status" aria-live="polite">
        {msg}
      </p>
      <small>
        <Link href="/privacy">{f.privacy}</Link>
      </small>
    </form>
  );
}
