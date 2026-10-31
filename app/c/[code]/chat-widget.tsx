'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import type { PageAction, PageActionId } from '@/lib/landing/actions';
import { focusPageAction } from '@/lib/landing/focus-action';
import { ApiError, apiSend } from '@/lib/http/client';

/**
 * The assistant on the prospect page (spec §18).
 *
 * Opens with a line tied to what was actually discussed. Every turn goes through
 * POST /api/chat; the five-answer cap is enforced there, atomically — the count
 * shown here is only a courtesy.
 *
 * In the rep's preview it renders a note instead of a working chat, so a rep
 * checking their page never spends the prospect's questions.
 */

type Turn = { role: 'assistant' | 'user'; text: string; actionId?: PageActionId };

export function ChatWidget({
  code,
  repFirstName,
  opening,
  enabled,
  preview = false,
  actions = [],
}: {
  code: string;
  repFirstName: string;
  opening: string;
  /** False when the kill switch is off (§18.2): the static answer instead. */
  enabled: boolean;
  preview?: boolean;
  actions?: PageAction[];
}) {
  const [open, setOpen] = useState(false);
  // With the kill switch off, the panel opens on the static answer (§18.2) rather
  // than asking a question it cannot take.
  const [turns, setTurns] = useState<Turn[]>([
    { role: 'assistant', text: enabled ? opening : explainCode('chat_disabled', repFirstName) },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    // The launcher unmounts while the panel is open: give focus back to it on close.
    else if (wasOpen.current) launcherRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns, busy]);

  if (preview) {
    return (
      <p className="border-line-soft text-ink-3 mt-6 rounded-lg border border-dashed px-3 py-2.5 text-[13px]">
        The assistant appears here for them. It is off in your preview, so checking your page never
        uses up their questions.
      </p>
    );
  }

  const exhausted = remaining === 0 || !enabled;

  async function ask() {
    const message = draft.trim();
    if (!message || busy || exhausted) return;

    setDraft('');
    setTurns((t) => [...t, { role: 'user', text: message }]);
    setBusy(true);

    try {
      const result = await apiSend<{ reply: string; remaining: number; actionId?: PageActionId }>(
        '/api/chat',
        'POST',
        {
          code,
          message,
        },
      );
      setTurns((t) => [...t, { role: 'assistant', text: result.reply, actionId: result.actionId }]);
      setRemaining(result.remaining);
    } catch (error) {
      setTurns((t) => [...t, { role: 'assistant', text: explain(error, repFirstName) }]);
      if (error instanceof ApiError && error.message === 'chat_disabled') setRemaining(0);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open ? (
        <div
          role="dialog"
          aria-label={`${repFirstName}’s AI assistant`}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          className="bg-surface border-line shadow-lifted fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-20 flex max-h-[min(34rem,80dvh)] flex-col overflow-hidden rounded-2xl border sm:inset-x-auto sm:right-4 sm:w-[24rem]"
        >
          <header className="border-line-soft flex shrink-0 items-center justify-between border-b px-4 py-3">
            <span className="font-display text-ink text-[15px] font-semibold">
              {repFirstName}&rsquo;s AI assistant
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-ink-3 hover:text-ink -mr-2 flex h-11 w-11 items-center justify-center rounded-lg"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <div
            className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-3"
            aria-live="polite"
          >
            {turns.map((turn, index) => {
              const action =
                turn.role === 'assistant' ? actions.find((a) => a.id === turn.actionId) : undefined;
              return (
                <div
                  key={index}
                  className={turn.role === 'user' ? 'ml-auto max-w-[85%]' : 'max-w-[85%]'}
                >
                  <p
                    className={
                      turn.role === 'assistant'
                        ? 'bg-surface-2 text-ink rounded-2xl rounded-bl-md px-3 py-2 text-[15px] leading-snug break-words'
                        : 'bg-accent text-on-accent rounded-2xl rounded-br-md px-3 py-2 text-[15px] leading-snug break-words'
                    }
                  >
                    {turn.text}
                  </p>
                  {action ? (
                    <button
                      type="button"
                      className="text-accent mt-1 min-h-11 rounded-lg px-3 text-left text-sm font-medium underline"
                      onClick={() => {
                        setOpen(false);
                        inputRef.current?.blur();
                        requestAnimationFrame(() => focusPageAction(action.id));
                      }}
                    >
                      Go to {action.label}
                    </button>
                  ) : null}
                </div>
              );
            })}
            {busy ? (
              <p className="text-ink-3 text-[13px]" role="status">
                Thinking…
              </p>
            ) : null}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
            className="border-line-soft flex shrink-0 items-center gap-2 border-t px-3 py-2.5"
          >
            <input
              ref={inputRef}
              id="chat-message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              disabled={exhausted}
              placeholder={
                exhausted ? `Get in touch to ask ${repFirstName} directly` : 'Ask a question…'
              }
              aria-label="Your question"
              className="border-line bg-surface text-ink placeholder:text-ink-3/70 focus:border-accent h-11 min-w-0 flex-1 rounded-full border px-4 text-base focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || exhausted || !draft.trim()}
              aria-label="Send"
              className="bg-accent text-on-accent flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
          {remaining !== null && remaining > 0 ? (
            <p className="text-ink-3 shrink-0 px-4 pb-2 text-[11px]">
              {remaining} {remaining === 1 ? 'question' : 'questions'} left here
            </p>
          ) : null}
        </div>
      ) : null}

      {!open ? (
        <button
          ref={launcherRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="border-line text-ink-2 flex min-h-12 w-full items-center justify-between gap-2 border-t py-3 text-left text-[15px]"
        >
          <span className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Questions first?
          </span>
          <span className="text-ink font-semibold">
            Ask {repFirstName}&rsquo;s assistant &rarr;
          </span>
        </button>
      ) : null}
    </>
  );
}

/** Every failure becomes an honest sentence pointing at the rep — never an error code. */
function explain(error: unknown, repFirstName: string): string {
  return explainCode(error instanceof ApiError ? error.message : '', repFirstName);
}

function explainCode(code: string, repFirstName: string): string {
  switch (code) {
    case 'chat_disabled':
      return `Questions are best answered by ${repFirstName} directly — get in touch using the options on this page.`;
    case 'rate_limited':
      return 'Give it a moment and try again.';
    case 'owner_preview':
      return 'This is your own card, so the assistant is off here.';
    default:
      return `I can’t answer right now. ${repFirstName} can — get in touch using the options on this page.`;
  }
}
