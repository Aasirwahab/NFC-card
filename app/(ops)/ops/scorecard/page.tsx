import Link from 'next/link';
import { requireStaff } from '@/lib/auth/staff';
import { percent } from '@/lib/domain/event-results';
import { bookedPer10Opened, type Scorecard } from '@/lib/domain/pilot-scorecard';
import { loadScorecard } from '@/lib/ops/scorecard';

export const metadata = { title: 'Pilot scorecard' };

/**
 * The pilot's numbers across every rep: are cards opened after the hand-over,
 * how soon, and do opens turn into meetings. Counts only, no prospect names.
 */
export default async function ScorecardPage() {
  await requireStaff();
  const { total, reps } = await loadScorecard();

  return (
    <div>
      <Link href="/ops" className="text-ink-3 text-[13px] underline underline-offset-2">
        ← Reps and stock
      </Link>
      <h1 className="font-display text-ink mt-3 text-2xl font-bold tracking-tight">
        Pilot scorecard
      </h1>
      <p className="text-ink-3 mt-1 text-[13px]">
        Cards in use, across every event. Opened means the prospect&apos;s page was viewed.
      </p>

      <div className="mt-5">
        <Row name="All reps" r={total} />
      </div>

      {reps.length > 0 ? (
        <ul className="mt-5 flex flex-col gap-2.5">
          {reps.map((rep) => (
            <li key={rep.userId}>
              <Row name={rep.name} r={rep.results} href={`/ops/users/${rep.userId}`} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-3 mt-5 text-[13px]">No cards in use yet.</p>
      )}
    </div>
  );
}

function Row({ name, r, href }: { name: string; r: Scorecard; href?: string }) {
  const per10 = bookedPer10Opened(r);
  const body = (
    <>
      <p className="text-ink truncate text-[15px] font-semibold">{name}</p>
      <p className="text-ink-2 mt-2 font-mono text-[12px]">
        {r.registered} in use · {r.opened} opened{share(r.opened, r.registered)}
      </p>
      <p className="text-ink-2 mt-1 font-mono text-[12px]">
        After hand-over: {r.repFirstOpened} of {r.repFirst} opened · {r.repFirstOpenedWithin24h}{' '}
        within 24 h
      </p>
      {r.prospectFirst > 0 ? (
        <p className="text-ink-3 mt-1 text-[12px]">
          {r.prospectFirst} first tapped by the prospect (not counted above)
        </p>
      ) : null}
      <p className="text-ink-2 mt-1 font-mono text-[12px]">
        {r.clickedBook} tapped book · {r.booked} booked ·{' '}
        {per10 === null ? '– per 10 opened' : `${per10} per 10 opened`}
      </p>
    </>
  );

  return href ? (
    <Link
      href={href}
      className="border-line bg-surface shadow-card block rounded-xl border px-4 py-3.5"
    >
      {body}
    </Link>
  ) : (
    <div className="border-line bg-surface shadow-card rounded-xl border px-4 py-3.5">{body}</div>
  );
}

function share(part: number, whole: number): string {
  const p = percent(part, whole);
  return p === null ? '' : ` (${p}%)`;
}
