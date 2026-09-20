'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { apiSend } from '@/lib/http/client';

type Batch = {
  id: string;
  label: string | null;
  size: number;
  created_at: string;
};

export function BatchList({
  batches,
  available,
  assigned,
}: {
  batches: Batch[];
  available: number;
  assigned: number;
}) {
  const router = useRouter();
  const [size, setSize] = useState('100');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);

    try {
      const { batch } = await apiSend<{ batch: { id: string } }>('/api/cards/batch', 'POST', {
        size: Number(size),
        label: label.trim() || undefined,
      });

      setLabel('');
      router.refresh();

      // Straight to the file: the codes are useless until they are on tags, and
      // `cards` is one of the two tables that can never be regenerated (§24.4).
      // This is a download, not a navigation — an anchor says so, where
      // router.push() would try to client-navigate to an API route.
      const download = document.createElement('a');
      download.href = `/api/cards/batch/${batch.id}/export`;
      download.download = '';
      document.body.appendChild(download);
      download.click();
      download.remove();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate the batch.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-ink text-2xl font-bold tracking-tight">Cards</h1>

      <div className="mt-4 flex gap-3">
        <Stat label="Unassigned" value={available} />
        <Stat label="Handed out" value={assigned} />
      </div>

      <section className="border-line bg-surface shadow-card mt-6 rounded-xl border p-4">
        <h2 className="text-ink font-display font-semibold tracking-tight">Generate a batch</h2>
        <p className="text-ink-2 mt-1 text-[13px] leading-snug">
          Download the CSV and write each URL to a sticker with NFC Tools. A tag is written once and
          can never be re-pointed, so keep the file until the batch is done.
        </p>

        <div className="mt-4 grid grid-cols-[6rem_1fr] gap-3">
          <Field label="How many" htmlFor="size">
            <Input
              id="size"
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              value={size}
              onChange={(e) => setSize(e.target.value)}
            />
          </Field>
          <Field label="Label" htmlFor="label">
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="First print run"
            />
          </Field>
        </div>

        {error ? (
          <p
            className="bg-crit-bg text-crit mt-3 rounded-lg px-3 py-2.5 text-sm font-medium"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <Button className="mt-4" size="block" onClick={generate} disabled={busy}>
          {busy ? 'Generating…' : 'Generate and download'}
        </Button>
      </section>

      {batches.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase">Batches</h2>
          <ul className="mt-2.5 flex flex-col gap-2">
            {batches.map((batch) => (
              <li
                key={batch.id}
                className="border-line bg-surface flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-ink truncate text-[15px] font-medium">
                    {batch.label || 'Untitled batch'}
                  </p>
                  <p className="text-ink-3 mt-0.5 font-mono text-[11px]">
                    {batch.size} cards · {new Date(batch.created_at).toLocaleDateString('en-GB')}
                  </p>
                </div>
                <a
                  href={`/api/cards/batch/${batch.id}/export`}
                  className="text-accent hover:bg-accent-soft shrink-0 rounded-lg p-2"
                  aria-label={`Download codes for ${batch.label || 'untitled batch'}`}
                >
                  <Download className="h-5 w-5" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
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
