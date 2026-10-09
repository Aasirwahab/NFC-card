'use client';

import { useState } from 'react';
import { apiSend } from '@/lib/http/client';

/**
 * "Remove my details": the prospect deleting the record made about them, without
 * emailing anyone. Two steps, because it cannot be undone.
 */
export function RemoveDetails({ code }: { code: string }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy' | 'done' | 'error'>('idle');

  async function remove() {
    setStep('busy');
    try {
      await apiSend(`/api/landing/${code}/remove`, 'POST', {});
      setStep('done');
    } catch {
      setStep('error');
    }
  }

  if (step === 'done') {
    return (
      <p role="status" className="text-ink mt-4 text-[13px]">
        Done. Your details have been removed and this page no longer shows them.
      </p>
    );
  }

  if (step === 'confirm' || step === 'busy' || step === 'error') {
    return (
      <div className="mt-4 text-[13px]">
        <p className="text-ink-2">
          Delete everything the person you met saved about you? This cannot be undone.
        </p>
        {step === 'error' ? (
          <p role="alert" className="text-crit mt-1">
            That did not work. Try again, or email us from the Privacy page.
          </p>
        ) : null}
        <div className="mt-2 flex gap-4">
          <button
            type="button"
            onClick={remove}
            disabled={step === 'busy'}
            className="text-crit font-medium underline underline-offset-2"
          >
            {step === 'busy' ? 'Removing…' : 'Yes, remove my details'}
          </button>
          <button
            type="button"
            onClick={() => setStep('idle')}
            className="hover:text-ink-2 underline underline-offset-2"
          >
            Keep them
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setStep('confirm')}
      className="hover:text-ink-2 mt-4 block underline underline-offset-2"
    >
      Remove my details
    </button>
  );
}
