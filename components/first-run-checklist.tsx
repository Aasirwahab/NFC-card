import Link from 'next/link';
import type { SetupProgress } from '@/lib/db/rep';

/** Problems are required so prospects have something to choose before the first handout. */
const REQUIRED = [
  { key: 'photo', href: '/settings#public-photo' },
  { key: 'business', href: '/settings#services' },
  { key: 'playbook', href: '/settings#problems' },
  { key: 'booking', href: '/settings#booking_url' },
] as const;

export function FirstRunChecklist({ progress }: { progress: SetupProgress }) {
  const done = REQUIRED.filter((step) => progress[step.key]).length;
  const next = REQUIRED.find((step) => !progress[step.key]);
  if (!next) return null;

  return (
    <section aria-label="Setup" className="border-line mt-5 border-y">
      <Link href={next.href} className="flex min-h-11 items-center gap-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-ink text-sm font-medium">
            Setup: {done} of {REQUIRED.length} done
          </p>
          {!progress.playbook ? (
            <p className="text-ink-3 text-[13px]">
              Add the problems you solve before handing out cards
            </p>
          ) : null}
          {!progress.booking ? (
            <p className="text-ink-3 text-[13px]">Add a booking link before handing out cards</p>
          ) : null}
        </div>
        <span className="text-accent shrink-0 text-sm font-semibold">Finish →</span>
      </Link>
    </section>
  );
}
