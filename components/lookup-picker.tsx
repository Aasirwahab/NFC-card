'use client';

import { useEffect, useState } from 'react';
import { apiSend } from '@/lib/http/client';

export type PickerItem = {
  key: string;
  primary: string;
  secondary?: string;
  badge?: string;
  /** Highlights the row: the one we would suggest (the rep still taps). */
  likely?: boolean;
  value: string;
};

/**
 * "Find it for me" for a field: one button, up to a handful of candidates, the rep
 * taps the right one. Suggests only; it never fills anything on its own.
 */
export function LookupPicker({
  buttonLabel,
  disabled,
  path,
  body,
  toItems,
  onPick,
  emptyText,
  onReady,
}: {
  buttonLabel: string;
  disabled: boolean;
  path: string;
  body: () => Record<string, unknown>;
  toItems: (response: never) => PickerItem[];
  onPick: (value: string) => void;
  emptyText: string;
  /** Lets a parent start the lookup itself (after a card scan), with fresh values. */
  onReady?: (api: { run: (override?: Record<string, unknown>) => void }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<PickerItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(override?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await apiSend<never>(path, 'POST', override ?? body());
      setItems(toItems(response));
    } catch (caught) {
      setItems(null);
      setError(
        caught instanceof Error && caught.message === 'rate_limited'
          ? 'That is a lot of lookups. Try again in a few minutes.'
          : 'Could not look that up. You can type it instead.',
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    onReady?.({ run: (override) => void run(override) });
    // `run` closes over state setters only; the handle stays valid for the component's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onReady]);

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => void run()}
        className="border-line bg-surface text-ink hover:border-ink-3 h-11 rounded-lg border px-3 text-sm font-medium disabled:opacity-50"
      >
        {busy ? 'Looking…' : buttonLabel}
      </button>

      {error ? (
        <p className="text-crit mt-2 text-[13px]" role="alert">
          {error}
        </p>
      ) : null}

      {items !== null && items.length === 0 ? (
        <p className="text-ink-3 mt-2 text-[13px]">{emptyText}</p>
      ) : null}

      {items && items.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => {
                  onPick(item.value);
                  setItems(null);
                }}
                className={`w-full rounded-xl border px-3.5 py-3 text-left ${
                  item.likely
                    ? 'border-accent bg-accent-soft'
                    : 'border-line bg-surface hover:border-ink-3'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-ink text-[15px] font-medium break-all">{item.primary}</span>
                  {item.badge ? (
                    <span className="text-ink-3 shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                {item.secondary ? (
                  <span className="text-ink-3 mt-0.5 block text-[13px] leading-snug">
                    {item.secondary}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setItems(null)}
              className="text-ink-3 hover:text-ink-2 text-[13px] underline underline-offset-2"
            >
              None of these
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
