'use client';

import { useEffect, useRef, useState } from 'react';
import { apiSend } from '@/lib/http/client';
import {
  classifyFailure,
  emptyText,
  failureText,
  shouldSearchOnBlur,
  withTimeout,
  type LookupFailure,
} from '@/lib/lookup/picker-state';

export type PickerItem = {
  key: string;
  primary: string;
  secondary?: string;
  /** Where the rep can look at this candidate before choosing it (opens in a new tab). */
  checkUrl?: string;
  badge?: string;
  /** Highlights the row: the one we would suggest (the rep still taps). */
  likely?: boolean;
  value: string;
};

export type LookupPickerApi = {
  run: (override?: Record<string, unknown>) => void;
  /** Search only if the question is new since the last search (for leaving a field). */
  runIfChanged: () => void;
};

/**
 * "Find it for me" for a field: one button, up to a handful of candidates, the rep
 * taps the right one. Suggests only; it never fills anything on its own.
 */
export function LookupPicker({
  buttonLabel,
  disabled,
  disabledReason,
  path,
  body,
  queryText,
  toItems,
  onPick,
  onReady,
  filled = false,
}: {
  buttonLabel: string;
  disabled: boolean;
  /** One short line shown while the button is disabled: what is missing. */
  disabledReason: string;
  path: string;
  body: () => Record<string, unknown>;
  /** The request as the rep would say it ("Sarah Lee at Acme"): shown with the results, and what "changed" means. */
  queryText: (body: Record<string, unknown>) => string;
  toItems: (response: never) => PickerItem[];
  onPick: (value: string) => void;
  /** Lets a parent start the lookup itself (after a card scan, or on leaving a field). */
  onReady?: (api: LookupPickerApi) => void;
  /** The field already has a value: the button reads "Search again". */
  filled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<PickerItem[] | null>(null);
  const [failure, setFailure] = useState<LookupFailure | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  // What the shown answer (or failure) was asked for. Typing something else makes it stale.
  const [askedFor, setAskedFor] = useState('');

  const latest = useRef(0);
  const lastQuery = useRef<string | null>(null);
  // The newest props, for a handle a parent calls later (a blur, a scan).
  const live = useRef({ body, queryText, disabled, filled, busy });
  useEffect(() => {
    live.current = { body, queryText, disabled, filled, busy };
  });

  const currentQuery = queryText(body());
  const fresh = askedFor === currentQuery;

  async function run(override?: Record<string, unknown>) {
    const sent = override ?? live.current.body();
    const query = live.current.queryText(sent);
    lastQuery.current = query;
    // A slow answer to an older request must never replace a newer one.
    const mine = ++latest.current;
    setBusy(true);
    setFailure(null);
    setItems(null);
    setAskedFor(query);
    try {
      const response = await withTimeout(apiSend<never>(path, 'POST', sent));
      if (mine !== latest.current) return;
      setShowOthers(false);
      setItems(toItems(response));
    } catch (caught) {
      if (mine !== latest.current) return;
      setFailure(classifyFailure(caught));
    } finally {
      if (mine === latest.current) setBusy(false);
    }
  }

  useEffect(() => {
    onReady?.({
      run: (override) => void run(override),
      // Leaving a field: search once, only for a new, usable, unfilled question.
      runIfChanged: () => {
        const l = live.current;
        const query = l.queryText(l.body());
        if (
          shouldSearchOnBlur({
            enabled: !l.disabled,
            filled: l.filled,
            query,
            lastQuery: lastQuery.current,
          })
        ) {
          void run();
        }
      },
    });
    // `run` reads the newest props from `live`; the handle stays valid for the component's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onReady]);

  const shownItems = fresh ? items : null;

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => void run()}
        className="border-line bg-surface text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:border-ink-3 h-11 rounded-lg border px-3 text-sm font-medium disabled:opacity-50"
      >
        {busy ? 'Looking…' : filled ? 'Search again' : buttonLabel}
      </button>

      {disabled && !busy ? <p className="text-ink-3 mt-1 text-[13px]">{disabledReason}</p> : null}

      {fresh && failure ? (
        <p className="text-crit mt-2 text-[13px]" role="alert">
          {failureText(failure)}
        </p>
      ) : null}

      {fresh && !busy && shownItems !== null && shownItems.length === 0 ? (
        <p className="text-ink-3 mt-2 text-[13px]" role="status">
          {emptyText(askedFor)}
        </p>
      ) : null}

      {shownItems && shownItems.length > 0 ? (
        <p className="text-ink-3 mt-2 text-[13px]">Results for {askedFor}</p>
      ) : null}

      {shownItems && shownItems.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2" aria-live="polite">
          {(showOthers || !shownItems.some((i) => i.likely)
            ? shownItems
            : shownItems.filter((i) => i.likely)
          ).map((item) => (
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
                    : 'border-line bg-surface [@media(hover:hover)_and_(pointer:fine)]:hover:border-ink-3'
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
              {item.checkUrl ? (
                <a
                  href={item.checkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-3 [@media(hover:hover)_and_(pointer:fine)]:hover:text-ink-2 mt-1 ml-1 inline-block text-[12px] underline underline-offset-2"
                >
                  Open to check
                </a>
              ) : null}
            </li>
          ))}
          {!showOthers && shownItems.some((i) => i.likely) && shownItems.length > 1 ? (
            <li>
              <button
                type="button"
                onClick={() => setShowOthers(true)}
                className="text-ink-2 text-[13px] font-medium underline underline-offset-2"
              >
                Other ({shownItems.length - 1})
              </button>
            </li>
          ) : null}
          <li>
            <button
              type="button"
              onClick={() => setItems(null)}
              className="text-ink-3 [@media(hover:hover)_and_(pointer:fine)]:hover:text-ink-2 text-[13px] underline underline-offset-2"
            >
              None of these? Type it in the field above.
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
