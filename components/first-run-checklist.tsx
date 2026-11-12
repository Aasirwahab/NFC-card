import Link from 'next/link';
import type { SetupProgress } from '@/lib/db/rep';

type Step = { key: keyof SetupProgress; label: string; hint: string; href: string };

/** The three things that must be true before the first card works. */
const REQUIRED: Step[] = [
  {
    key: 'photo',
    label: 'Add your photo',
    hint: 'A face makes your page read as a person.',
    href: '/settings',
  },
  {
    key: 'business',
    label: 'Add a one-line offer',
    hint: 'Your business and what you offer, in a line. The AI only ever uses what you write.',
    href: '/settings',
  },
  {
    key: 'booking',
    label: 'Add your booking link',
    hint: 'Your Cal.com link, so they can book from the page.',
    href: '/settings',
  },
];

const LATER: Step[] = [
  {
    key: 'playbook',
    label: 'Add the problems you solve',
    hint: 'For a problem you hear often: why it happens and three things to check. Your prospect gets it as written.',
    href: '/settings',
  },
  {
    key: 'tapTested',
    label: 'Tap your own card',
    hint: 'Hold the top of your iPhone to a card while signed in on Safari. It opens here as your first contact.',
    href: '/cards',
  },
];

/**
 * Setup on Today: three steps before the first card works, open until they are
 * done. Optional steps follow under "Later" and fold away once the three are done.
 */
export function FirstRunChecklist({ progress }: { progress: SetupProgress }) {
  const done = REQUIRED.filter((s) => progress[s.key]).length;
  const laterLeft = LATER.filter((s) => !progress[s.key]);
  if (done === REQUIRED.length && laterLeft.length === 0) return null;

  if (done === REQUIRED.length) {
    return (
      <details className="border-line mt-3 rounded-lg border px-3 py-2">
        <summary className="text-ink-2 flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <span className="text-ink font-medium">Setup done</span>
          <span aria-hidden="true">·</span>
          <span>Later: {laterLeft.length}</span>
        </summary>
        <StepList steps={laterLeft} progress={progress} />
      </details>
    );
  }

  return (
    <section className="border-line mt-3 rounded-lg border px-3 py-3" aria-labelledby="setup-title">
      <h2 id="setup-title" className="text-ink text-sm font-medium">
        Setup {done} of {REQUIRED.length}
      </h2>
      <StepList steps={REQUIRED} progress={progress} />
      <h3 className="text-ink-3 mt-4 text-[13px] font-medium">Later</h3>
      <StepList steps={LATER} progress={progress} />
    </section>
  );
}

function StepList({ steps, progress }: { steps: Step[]; progress: SetupProgress }) {
  return (
    <ul className="mt-2 flex flex-col gap-3 pb-1">
      {steps.map((step) => {
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
  );
}
