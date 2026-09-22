'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { ApiError, apiSend } from '@/lib/http/client';

/**
 * "Email me this page" (spec §19.2): for the prospect who is not ready to book
 * but does not want to lose the page. They type their own address; the form says
 * plainly that the rep will see it too.
 */
export function EmailMe({ code, repFirstName }: { code: string; repFirstName: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  if (status === 'sent') {
    return (
      <p className="text-ok mt-4 text-sm font-medium" role="status">
        Sent to {email}. It has a link back here whenever you want it.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-accent mt-4 flex items-center gap-1.5 text-sm font-medium underline underline-offset-2"
      >
        <Mail className="h-4 w-4" aria-hidden="true" />
        Not ready? Email me this page
      </button>
    );
  }

  async function send() {
    setStatus('sending');
    setMessage(null);
    try {
      await apiSend(`/api/landing/${code}/email`, 'POST', { email });
      setStatus('sent');
    } catch (error) {
      const reason = error instanceof ApiError ? error.message : '';
      setMessage(
        reason === 'invalid_email'
          ? 'That does not look like an email address.'
          : reason === 'rate_limited'
            ? 'That has been sent a few times already. Try again tomorrow.'
            : 'Could not send it just now. Try again in a minute.',
      );
      setStatus('error');
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className="mt-4 flex flex-col gap-2"
    >
      <label htmlFor="email-me" className="text-ink-2 text-sm font-medium">
        Your email
      </label>
      <div className="flex gap-2">
        <input
          id="email-me"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/20 h-11 min-w-0 flex-1 rounded-lg border px-3 text-base focus:ring-2 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="bg-accent hover:bg-accent-hover h-11 shrink-0 rounded-lg px-4 text-[15px] font-medium text-white disabled:opacity-50"
        >
          {status === 'sending' ? 'Sending…' : 'Send'}
        </button>
      </div>
      <p className="text-ink-3 text-[12px]">
        We&rsquo;ll send you this page. {repFirstName} will see your email too.
      </p>
      {message ? (
        <p className="text-crit text-[13px]" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
