'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { apiSend } from '@/lib/http/client';

/**
 * "Is this their website?" (2026-09-25 review).
 *
 * Shown only when the pipeline GUESSED the prospect's site from the company name.
 * A common name matches many companies, so the guessed site's facts are held
 * back from the page until the rep says yes. Ignoring this is safe: the pitch
 * stays written from the conversation alone.
 */
export function WebsiteCheck({ sessionId, domain }: { sessionId: string; domain: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/sessions/${sessionId}/website`, 'POST', { website: domain });
      setDone(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="bg-surface border-line text-ink-2 mt-5 rounded-2xl border p-4 text-[14px]">
        Thanks. Rewriting the pitch with what {domain} says. This takes about a minute.
      </p>
    );
  }

  return (
    <div className="bg-warn-bg border-line mt-5 rounded-2xl border p-4">
      <p className="text-ink text-[15px] font-semibold">Is {domain} their website?</p>
      <p className="text-ink-2 mt-1 text-[13px] leading-snug">
        We guessed it from the company name. Until you confirm, the pitch leaves out anything from
        that site, in case it&rsquo;s a different company with the same name.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={confirm} disabled={busy}>
          {busy ? 'Saving…' : 'Yes, use it'}
        </Button>
        <Link
          href={`/sessions/${sessionId}/edit`}
          className="text-ink-2 hover:text-ink self-center text-[14px] underline underline-offset-2"
        >
          No, enter their site
        </Link>
      </div>
      {error ? <p className="text-warn mt-2 text-[13px]">{error}</p> : null}
    </div>
  );
}
