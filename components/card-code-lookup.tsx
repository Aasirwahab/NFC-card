'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';

/**
 * Open a card by its printed code (operating model v2): the backup when NFC or QR
 * will not read, and how a card handed over without a tap is completed later.
 * Accepts the printed form (K7M3-PQ2X), spaces and lower case.
 */
export function CardCodeLookup({ className }: { className?: string }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function open(event: React.FormEvent) {
    event.preventDefault();
    const code = normaliseCode(value);
    if (!isValidCode(code)) {
      setError('That is not a card code. It is 8 characters, like K7M3-PQ2X.');
      return;
    }
    setError(null);
    router.push(`/c/${code}`);
  }

  return (
    <form onSubmit={open} className={className} noValidate>
      <label htmlFor="card-code" className="text-ink text-[13px] font-semibold">
        Card code
      </label>
      <p className="text-ink-3 mt-0.5 text-[13px]">
        Printed on the back. Use it if a tap will not read, or to add details to a card you handed
        over.
      </p>
      <div className="mt-2 flex gap-2">
        <Input
          id="card-code"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="K7M3-PQ2X"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="go"
          className="font-mono uppercase"
        />
        <Button type="submit" className="shrink-0">
          Open
        </Button>
      </div>
      {error ? (
        <p className="text-crit mt-2 text-[13px]" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
