import Link from 'next/link';
import styles from '@/app/ui-slice.module.css';
import { CardCodeLookup } from '@/components/card-code-lookup';
import { FirstRunChecklist } from '@/components/first-run-checklist';
import { TapGuide } from '@/components/tap-guide';
import { SessionRow } from '@/components/session-row';
import { FollowupToday } from '@/components/followup-card';
import {
  getSetupProgress,
  listEvents,
  listFollowups,
  listSessions,
  type SessionListItem,
} from '@/lib/db/rep';
import { requireRep } from '@/lib/db/server';
import { ShowQr } from '@/components/show-qr';

export const metadata = { title: 'Today' };
export const dynamic = 'force-dynamic';

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
  const followups = {
    actionable: allFollowups.actionable.filter((f) => shown.has(f.sessionId)),
    history: allFollowups.history.filter((f) => shown.has(f.sessionId)),
  };

  const needsDetails = sessions.filter((s) => !s.details_completed_at);
  const noChannel = sessions.filter(
    (s) => s.details_completed_at && !s.linkedin_url && !s.prospect_email,
  );
  const rest = sessions.filter(
    (s) => s.details_completed_at && (s.linkedin_url || s.prospect_email),
  );

  const summary = [
    { id: 'follow-up', count: followups.actionable.length, label: 'to follow up' },
    { id: 'needs-details', count: needsDetails.length, label: 'need details' },
    { id: 'needs-contact', count: noChannel.length, label: 'need a way to reach them' },
    { id: 'other-contacts', count: rest.length, label: 'other contacts' },
  ].filter((section) => section.count > 0);

  const tapped = sessions.filter((s) => s.first_viewed_at).length;

  return (
    <div className={`${styles.surface} ${styles.repSurface} ${styles.today}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className={styles.todayTitle}>Today</h1>
        <p className="text-ink-3 font-mono text-[11px]">
          {sessions.length} contact{sessions.length === 1 ? '' : 's'} · {tapped} opened
        </p>
      </div>

      <ShowQr />

      {summary.length ? (
        <nav
          aria-label="Contact summary"
          className="text-ink-2 mt-2 flex gap-2 overflow-x-auto pb-1 text-sm"
        >
          {summary.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="border-line bg-surface inline-flex min-h-11 shrink-0 items-center rounded-full border px-3"
            >
              {section.count} {section.label}
            </a>
          ))}
        </nav>
      ) : null}

      {sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-5 flex flex-col gap-6">
          {followups.actionable.length + followups.history.length > 0 ? (
            <FollowupToday {...followups} />
          ) : null}

          <Group
            id="needs-details"
            title="Needs details"
            hint="Fill these in while you still remember the conversation."
            sessions={needsDetails}
          />

          <Group
            id="needs-contact"
            title="Add a way to reach them"
            hint="Open the contact and add LinkedIn or email so you can follow up."
            sessions={noChannel}
            tone="warn"
          />

          <Group id="other-contacts" title="Everything else" sessions={rest} />
        </div>
      )}
      {sessions.length > 0 && needsDetails.length === 0 && followups.actionable.length === 0 ? (
        <p className="text-ink mt-5 font-medium">All caught up.</p>
      ) : null}

      <FirstRunChecklist progress={progress} />
      {events.length > 1 ? <EventFilter events={events} selected={eventId} /> : null}
      <details className="border-line mt-5 border-t pt-2">
        <summary className="text-ink-2 flex min-h-11 cursor-pointer items-center text-sm font-medium">
          Type a card code
        </summary>
        <p className="text-ink-2 mt-2 text-sm">Add a contact: tap your card, or type its code.</p>
        <CardCodeLookup className={styles.cardLookup} />
      </details>
    </div>
  );
}

function Group({
  id,
  title,
  hint,
  sessions,
  tone,
}: {
  id: string;
  title: string;
  hint?: string;
  sessions: SessionListItem[];
  tone?: 'warn';
}) {
  if (sessions.length === 0) return null;

  return (
    <section id={id} className="scroll-mt-4">
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
      <h2 className="text-ink text-center text-xl font-semibold">Hand out your first card.</h2>
      <p className="text-ink-2 mx-auto mt-1.5 max-w-sm text-center text-sm">
        Tap a card, then hand it over — the contact appears here ready for your notes.
      </p>
      <TapGuide />
    </div>
  );
}
