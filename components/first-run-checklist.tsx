import Link from 'next/link';
import type { SetupProgress } from '@/lib/db/rep';

const STEPS: { key: keyof SetupProgress; label: string; hint: string; href: string }[] = [
  {
    key: 'photo',
    label: 'Add your photo',
    hint: 'A face makes your page read as a person.',
    href: '/settings',
  },
  {
    key: 'business',
    label: 'Say what you do',
    hint: 'Your company and up to three services. The AI only ever uses what you write.',
    href: '/settings',
  },
  {
    key: 'booking',
    label: 'Add your booking link',
    hint: 'Your Cal.com link, so they can book from the page.',
    href: '/settings',
  },
  {
    key: 'playbook',
    label: 'Write one playbook entry',
    hint: 'For a problem you hear often: why it happens and three things to check. Your prospect gets it as written.',
    href: '/settings',
  },
  {
    key: 'tapTested',
    label: 'Tap your own card',
    hint: 'Hold the top of your iPhone to a card while signed in on Safari. It opens here as your first lead.',
    href: '/cards',
  },
];

/** Shown on Today until each step is done. Every step links to where it is done. */
export function FirstRunChecklist({ progress }: { progress: SetupProgress }) {
  const done = STEPS.filter((s) => progress[s.key]).length;
  if (done === STEPS.length) return null;

  return (
    <section
      className="border-line bg-surface shadow-card mt-4 rounded-xl border p-4"
      aria-label="Get ready"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-ink font-semibold tracking-tight">Get ready</h2>
        <span className="text-ink-3 font-mono text-[11px]">
          {done} of {STEPS.length}
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {STEPS.map((step) => {
          const ok = progress[step.key];
          return (
            <li key={step.key} className="flex gap-3">
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] ${
                  ok ? 'bg-ok text-white' : 'border-line border'
                }`}
              >
                {ok ? '✓' : ''}
              </span>
              <div className="min-w-0">
                {ok ? (
                  <p className="text-ink-3 text-[15px] line-through">{step.label}</p>
                ) : (
                  <Link
                    href={step.href}
                    className="text-ink text-[15px] font-medium underline-offset-2 hover:underline"
                  >
                    {step.label}
                  </Link>
                )}
                {!ok ? <p className="text-ink-3 text-[13px] leading-snug">{step.hint}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
