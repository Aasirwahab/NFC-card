import Link from 'next/link';
import styles from '@/app/ui-slice.module.css';
import { CardCodeLookup } from '@/components/card-code-lookup';
import { FirstRunChecklist } from '@/components/first-run-checklist';
import { TapGuide } from '@/components/tap-guide';
import { SessionRow } from '@/components/session-row';
import { FollowupCard } from '@/components/followup-card';
import {
  getSetupProgress,
  listEvents,
  listFollowups,
  listSessions,
  type SessionListItem,
} from '@/lib/db/rep';
import { requireRep } from '@/lib/db/server';

export const metadata = { title: 'Today' };
export const dynamic = 'force-dynamic';

/**
 * The dashboard (spec §15.2, §19.3).
 *
 * A card code box sits at the top: the backup when a tap will not read, and how a
 * card handed over untapped is completed later. Then groups, in the order a rep actually needs them:
 *
 *   1. NEEDS DETAILS   — registered at the table, never filled in. The most
 *                        time-sensitive group: the conversation is still fresh.
 *   2. NO WAY TO REACH — details saved, but neither LinkedIn nor email. The spec
 *                        is explicit that this case is SURFACED, not hidden: it is
 *                        the feedback loop that makes reps capture a LinkedIn URL
 *                        next time (§19.3).
 *   3. FOLLOW UP       — a day on and still not opened: a draft to send by hand
 *                        (§19.3). Never mentions that they haven't opened it.
 *   4. EVERYTHING ELSE — newest first.
 */
export default async function DashboardPage({ searchParams }: PageProps<'/dashboard'>) {
  const rep = await requireRep();
  const { event } = await searchParams;
  const eventId = typeof event === 'string' ? event : undefined;

  const [events, sessions, allFollowups, progress] = await Promise.all([
    listEvents(rep.userId),
    listSessions(rep.userId, { eventId }),
    listFollowups(rep.userId),
    getSetupProgress(rep.userId),
  ]);
  const shown = new Set(sessions.map((s) => s.id));
  const followups = allFollowups.filter((f) => shown.has(f.sessionId));

  const needsDetails = sessions.filter((s) => !s.details_completed_at);
  const noChannel = sessions.filter(
    (s) => s.details_completed_at && !s.linkedin_url && !s.prospect_email,
  );
  const rest = sessions.filter(
    (s) => s.details_completed_at && (s.linkedin_url || s.prospect_email),
  );

  const tapped = sessions.filter((s) => s.first_viewed_at).length;

  return (
    <div className={`${styles.surface} ${styles.repSurface} ${styles.today}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className={styles.todayTitle}>Today</h1>
        <p className="text-ink-3 font-mono text-[11px]">
          {sessions.length} lead{sessions.length === 1 ? '' : 's'} · {tapped} tapped
        </p>
      </div>

      {needsDetails.length > 0 ? (
        <>
          <p className={styles.headline}>
            {needsDetails.length} card{needsDetails.length === 1 ? '' : 's'} <br />
            need{needsDetails.length === 1 ? 's' : ''} you.
          </p>
          <p className="text-ink-3 mt-3 text-sm">Say it now, while you still remember the room.</p>
        </>
      ) : (
        <p className={styles.headline}>All caught up.</p>
      )}

      <p className="text-ink-2 mt-4 text-sm">Start a capture: tap your card, or type its code.</p>
      <CardCodeLookup className={styles.cardLookup} />

      {!progress.booking ? (
        <aside className={styles.bookingWarning}>
          <Link href="/settings#booking_url">Add a booking link before you hand out cards</Link>
        </aside>
      ) : null}

      <FirstRunChecklist progress={progress} />

      {events.length > 1 ? <EventFilter events={events} selected={eventId} /> : null}

      {sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-5 flex flex-col gap-6">
          <Group
            title="Needs details"
            hint="Fill these in while you still remember the conversation."
            sessions={needsDetails}
          />

          <Group
            title="Add a way to reach them"
            hint="Open the lead and add LinkedIn or email so you can follow up."
            sessions={noChannel}
            tone="warn"
          />

          {followups.length > 0 ? (
            <section>
              <h2 className="text-ink text-base font-semibold">Follow up · {followups.length}</h2>
              <p className="text-ink-3 mt-1 text-[13px] leading-snug">
                A day on and they haven&rsquo;t opened their card. A note to send yourself. It
                follows up on the conversation and says nothing about the card.
              </p>
              <div className="mt-2.5 flex flex-col">
                {followups.map((item) => (
                  <FollowupCard key={item.sessionId} item={item} />
                ))}
              </div>
            </section>
          ) : null}

          <Group title="Everything else" sessions={rest} />
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  hint,
  sessions,
  tone,
}: {
  title: string;
  hint?: string;
  sessions: SessionListItem[];
  tone?: 'warn';
}) {
  if (sessions.length === 0) return null;

  return (
    <section>
      <h2 className={`text-base font-semibold ${tone === 'warn' ? 'text-warn' : 'text-ink'}`}>
        {title} · {sessions.length}
      </h2>
      {hint ? <p className="text-ink-3 mt-1 text-[13px] leading-snug">{hint}</p> : null}

      <div className="mt-2.5 flex flex-col">
        {sessions.map((session) => (
          <SessionRow key={session.id} session={session} />
        ))}
      </div>
    </section>
  );
}

function EventFilter({
  events,
  selected,
}: {
  events: { id: string; name: string }[];
  selected: string | undefined;
}) {
  return (
    <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <FilterChip href="/dashboard" label="All" active={!selected} />
      {events.map((event) => (
        <FilterChip
          key={event.id}
          href={`/dashboard?event=${event.id}`}
          label={event.name}
          active={selected === event.id}
        />
      ))}
    </div>
  );
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-sm whitespace-nowrap ${
        active
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line bg-surface text-ink-2 [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40'
      }`}
    >
      {label}
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="border-line bg-surface mt-6 rounded-xl border border-dashed p-6">
      <p className="text-ink text-center font-medium">No leads yet</p>
      <p className="text-ink-2 mx-auto mt-1.5 max-w-sm text-center text-sm">
        Hand a card over. Anyone who taps it, and any card you tap yourself, shows up here.
      </p>
      <TapGuide />
    </div>
  );
}
