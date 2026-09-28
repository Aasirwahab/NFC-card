import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRep } from '@/lib/db/server';
import { resultsForEvent } from '@/lib/db/results';
import { percent, type EventResults } from '@/lib/domain/event-results';

export const metadata = { title: 'Event results' };
export const dynamic = 'force-dynamic';

/**
 * Pilot results for one event (§27, Phase 5b).
 *
 * The four pilot questions, answered from what the product already records: do
 * people open the card and when, which sticker they use, where prospects stop,
 * and whether the pitches are any good. Basic counts only (§6).
 */
export default async function EventResultsPage({ params }: PageProps<'/events/[id]/results'>) {
  const rep = await requireRep();
  const { id } = await params;

  const loaded = await resultsForEvent(rep.userId, id);
  if (!loaded) notFound();
  const { event, results: r } = loaded;

  return (
    <div className="pb-6">
      <Link
        href="/events"
        className="text-ink-3 hover:text-ink-2 text-[13px] underline underline-offset-2"
      >
        ← Events
      </Link>
      <h1 className="font-display text-ink mt-3 text-2xl font-bold tracking-tight">{event.name}</h1>
      <p className="text-ink-3 mt-1 text-[13px]">
        {event.event_date ?? 'No date set'} · Results ·{' '}
        <a
          href={`/api/events/${event.id}/export`}
          className="hover:text-ink-2 underline underline-offset-2"
        >
          Download leads (CSV)
        </a>
      </p>

      {r.registered === 0 ? (
        <div className="border-line bg-surface mt-6 rounded-xl border border-dashed p-6 text-center">
          <p className="text-ink font-medium">No cards registered to this event yet</p>
          <p className="text-ink-2 mt-1.5 text-sm">
            Results appear here as soon as cards are registered and opened.
          </p>
        </div>
      ) : (
        <>
          <Funnel r={r} />

          <Section title="How they opened it">
            <Stat label="Tapped (NFC) or link" value={r.openedByNfc} of={r.opened} />
            <Stat label="Scanned the QR" value={r.openedByQr} of={r.opened} />
            <Stat label="Typical time to open" text={hours(r.medianHoursToOpen)} />
          </Section>

          <Section title="Your side">
            <Stat label="Details added" value={r.detailsAdded} of={r.registered} />
            <Stat label="Typical time to add details" text={hours(r.medianHoursToDetails)} />
            <Stat label="Pitches rated good" value={r.ratedUp} of={r.ratedUp + r.ratedDown} />
          </Section>

          <Section title="Research">
            <Stat label="Site you gave or confirmed" value={r.research.website} />
            <Stat label="From their work email" value={r.research.email} />
            <Stat label="Guessed, not confirmed" value={r.research.guess} />
            <Stat label="No site found" value={r.research.none} />
          </Section>

          <Section title="Engagement">
            <Stat label="Asked the assistant" value={r.chatUsed} of={r.opened} />
            <Stat label="Tapped LinkedIn" value={r.linkedinClicks} of={r.opened} />
          </Section>

          {r.released + r.voided > 0 ? (
            <p className="text-ink-3 mt-6 text-[13px]">
              Not counted above: {r.released} released for another event, {r.voided} voided.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Funnel({ r }: { r: EventResults }) {
  const steps = [
    { label: 'Registered', value: r.registered, base: null as number | null },
    { label: 'Opened', value: r.opened, base: r.registered },
    { label: 'Clicked book', value: r.clickedBook, base: r.opened },
    { label: 'Booked', value: r.booked, base: r.clickedBook },
  ];
  return (
    <section className="mt-6">
      <h2 className="text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase">
        Where prospects stop
      </h2>
      <ol className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((step) => {
          const share = step.base === null ? null : percent(step.value, step.base);
          return (
            <li key={step.label} className="border-line bg-surface rounded-xl border px-3.5 py-3">
              <p className="text-ink-3 text-[12px]">{step.label}</p>
              <p className="font-display text-ink mt-0.5 text-2xl font-bold tracking-tight">
                {step.value}
              </p>
              {share !== null ? (
                <p className="text-ink-3 text-[12px]">{share}% of the step before</p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase">{title}</h2>
      <dl className="border-line bg-surface mt-2.5 divide-y rounded-xl border">{children}</dl>
    </section>
  );
}

function Stat({
  label,
  value,
  of,
  text,
}: {
  label: string;
  value?: number;
  of?: number;
  text?: string;
}) {
  const share = value !== undefined && of !== undefined ? percent(value, of) : null;
  return (
    <div className="border-line flex items-baseline justify-between gap-3 px-3.5 py-2.5">
      <dt className="text-ink-2 text-[14px]">{label}</dt>
      <dd className="text-ink text-[15px] font-medium tabular-nums">
        {text ?? value}
        {share !== null ? <span className="text-ink-3 ml-1.5 text-[12px]">{share}%</span> : null}
      </dd>
    </div>
  );
}

function hours(value: number | null): string {
  if (value === null) return '—';
  if (value < 1) return `${Math.max(1, Math.round(value * 60))} min`;
  if (value < 48) return `${Math.round(value)} h`;
  return `${Math.round(value / 24)} days`;
}
