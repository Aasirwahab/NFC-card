import { printedCode } from '@/lib/cards/issue-batch';

/** Shown to staff when their tap verified a freshly written card. Never shown to anyone else. */
export function Programmed({ code, again = false }: { code: string; again?: boolean }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-ok font-mono text-[11px] tracking-[0.08em] uppercase">Programmed</p>
      <h1 className="font-display text-ink mt-2 font-mono text-3xl font-bold tracking-wider">
        {printedCode(code)}
      </h1>
      <p className="text-ink-2 mt-3 text-[15px]">
        {again
          ? 'Already verified. Tapping it again files nothing, since the card is still unused.'
          : 'This sticker opens the right card. Go back to the writing page for the next one.'}
      </p>
    </main>
  );
}

/**
 * A strip across the top of the portfolio when staff tap a card they have just
 * written. Only staff ever see it, and it says the tap filed nothing.
 */
export function StaffTapBanner({ code, again }: { code: string; again: boolean }) {
  return (
    <div
      role="status"
      className="bg-ink text-surface sticky top-0 z-50 px-4 py-2 text-center text-[13px] font-medium"
    >
      {again ? 'Card already checked' : 'Sticker works: card activated'} · {printedCode(code)} ·
      staff view, this tap filed nothing
    </div>
  );
}
