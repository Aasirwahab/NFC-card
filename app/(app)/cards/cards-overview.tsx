'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CardCodeLookup } from '@/components/card-code-lookup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import { apiSend } from '@/lib/http/client';

type Batch = { id: string; label: string | null; size: number; created_at: string };

/**
 * The rep's cards (operating model v2). Cards are issued to the rep by us, so
 * there is nothing to generate here: how many are in stock, how many are out, a
 * way to open a card by its code, and a way to mark one lost.
 */
export function CardsOverview({
  batches,
  inStock,
  handedOut,
  lost,
}: {
  batches: Batch[];
  inStock: number;
  handedOut: number;
  lost: number;
}) {
  return (
    <div>
      <h1 className="font-display text-ink text-2xl font-bold tracking-tight">Cards</h1>

      <div className="mt-4 flex gap-3">
        <Stat label="In stock" value={inStock} />
        <Stat label="Handed out" value={handedOut} />
        <Stat label="Lost or voided" value={lost} />
      </div>

      <section className="border-line bg-surface shadow-card mt-6 rounded-xl border p-4">
        <CardCodeLookup />
      </section>

      <LostCard />

      {batches.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase">
            Issued to you
          </h2>
          <ul className="mt-2.5 flex flex-col gap-2">
            {batches.map((batch) => (
              <li key={batch.id} className="border-line bg-surface rounded-xl border px-3.5 py-3">
                <p className="text-ink truncate text-[15px] font-medium">
                  {batch.label || 'Card batch'}
                </p>
                <p className="text-ink-3 mt-0.5 font-mono text-[11px]">
                  {batch.size} cards · {new Date(batch.created_at).toLocaleDateString('en-GB')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-ink-2 mt-6 text-[15px]">
          No cards have been issued to you yet. We create them and send them to you.
        </p>
      )}
    </div>
  );
}

function LostCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function markLost(event: React.FormEvent) {
    event.preventDefault();
    const code = normaliseCode(value);
    if (!isValidCode(code)) {
      setMessage({ ok: false, text: 'That is not a card code.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await apiSend('/api/cards/lost', 'POST', { code });
      setMessage({ ok: true, text: 'Marked lost. Anyone who finds it sees your portfolio only.' });
      setValue('');
      router.refresh();
    } catch (caught) {
      setMessage({
        ok: false,
        text:
          caught instanceof Error && caught.message.includes('card_in_use')
            ? 'That card already has a lead. Open it and void the lead instead.'
            : 'Could not mark that card lost. Check the code.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-ink-3 hover:text-ink-2 mt-4 text-[13px] underline underline-offset-2"
      >
        Lost a card?
      </button>
    );
  }

  return (
    <form onSubmit={markLost} className="border-line mt-4 rounded-xl border p-4" noValidate>
      <p className="text-ink text-[13px] font-semibold">Mark an unused card lost</p>
      <div className="mt-2 flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="K7M3-PQ2X"
          autoComplete="off"
          autoCapitalize="characters"
          className="font-mono uppercase"
          aria-label="Card code of the lost card"
        />
        <Button type="submit" variant="secondary" disabled={busy} className="shrink-0">
          {busy ? 'Saving…' : 'Mark lost'}
        </Button>
      </div>
      {message ? (
        <p className={`${message.ok ? 'text-ok' : 'text-crit'} mt-2 text-[13px]`} role="status">
          {message.text}
        </p>
      ) : null}
    </form>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-line bg-surface flex-1 rounded-xl border px-3.5 py-3">
      <p className="text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase">{label}</p>
      <p className="font-display text-ink mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
