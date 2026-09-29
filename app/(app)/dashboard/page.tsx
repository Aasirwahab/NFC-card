import Link from 'next/link';
import { CardCodeLookup } from '@/components/card-code-lookup';
import { TapGuide } from '@/components/tap-guide';
import { SessionRow } from '@/components/session-row';
import { FollowupCard } from '@/components/followup-card';
import { listEvents, listFollowups, listSessions, type SessionListItem } from '@/lib/db/rep';
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

  const [events, sessions, allFollowups] = await Promise.all([
    listEvents(rep.userId),
    listSessions(rep.userId, { eventId }),
    listFollowups(rep.userId),
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
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-ink text-2xl font-bold tracking-tight">Today</h1>
        <p className="text-ink-3 font-mono text-[11px]">
          {sessions.length} lead{sessions.length === 1 ? '' : 's'} · {tapped} tapped
        </p>
      </div>

      {events.length > 1 ? <EventFilter events={events} selected={eventId} /> : null}

      <CardCodeLookup className="border-line bg-surface mt-4 rounded-xl border p-4" />

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
            title="No way to reach them"
            hint="No LinkedIn and no email. If they never tap, there is nothing to follow up with — worth remembering a face."
            sessions={noChannel}
            tone="warn"
          />

          {followups.length > 0 ? (
            <section>
              <h2 className="text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase">
                Follow up · {followups.length}
              </h2>
              <p className="text-ink-3 mt-1 text-[13px] leading-snug">
                A day on and they haven&rsquo;t opened their card. A note to send yourself. It
                follows up on the conversation and says nothing about the card.
              </p>
              <div className="mt-2.5 flex flex-col gap-2">
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
      <h2
        className={`font-mono text-[11px] tracking-[0.08em] uppercase ${
          tone === 'warn' ? 'text-warn' : 'text-ink-3'
        }`}
      >
        {title} · {sessions.length}
      </h2>
      {hint ? <p className="text-ink-3 mt-1 text-[13px] leading-snug">{hint}</p> : null}

      <div className="mt-2.5 flex flex-col gap-2">
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
    <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
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
      className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium whitespace-nowrap ${
        active
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line bg-surface text-ink-2 hover:border-accent/40'
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
