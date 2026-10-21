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

/**
 * One line on Today until setup is done: progress and the next step, linked. The
 * full list opens on demand, so it never pushes capture down the screen.
 */
export function FirstRunChecklist({ progress }: { progress: SetupProgress }) {
  const done = STEPS.filter((s) => progress[s.key]).length;
  if (done === STEPS.length) return null;
  const next = STEPS.find((s) => !progress[s.key])!;

  return (
    <details className="border-line mt-3 rounded-lg border px-3 py-2" aria-label="Get ready">
      <summary className="text-ink-2 flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <span className="text-ink font-medium">
          Setup {done} of {STEPS.length}
        </span>
        <span aria-hidden="true">·</span>
        <span className="min-w-0 truncate">Next: {next.label.toLowerCase()}</span>
      </summary>
      <ul className="mt-2 flex flex-col gap-3 pb-1">
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
                    className="text-ink text-[15px] font-medium underline-offset-2 [@media(hover:hover)_and_(pointer:fine)]:hover:underline"
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
    </details>
  );
}
