import Link from 'next/link';
import { buttonStyles } from '@/components/ui/button';
import { listEvents } from '@/lib/db/rep';
import { requireRep } from '@/lib/db/server';

export const metadata = { title: 'Events' };
export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  const rep = await requireRep();
  const events = await listEvents(rep.userId);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-ink text-2xl font-bold tracking-tight">Events</h1>
        <Link href="/events/new" className={buttonStyles({ size: 'sm' })}>
          New event
        </Link>
      </div>

      <p className="text-ink-2 mt-2 text-sm">
        Cards are numbered per event, starting at Card 1 each time.
      </p>

      {events.length === 0 ? (
        <div className="border-line bg-surface mt-6 rounded-xl border border-dashed p-6 text-center">
          <p className="text-ink font-medium">No events yet</p>
          <p className="text-ink-2 mt-1.5 text-sm">
            An event holds the niches and the problems you pick from when adding details.
          </p>
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="border-line bg-surface flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3"
            >
              <div className="min-w-0">
                <p className="text-ink truncate text-[15px] font-medium">{event.name}</p>
                <p className="text-ink-3 mt-0.5 text-[13px]">
                  {[event.event_date, event.location].filter(Boolean).join(' · ') || 'No date set'}
                </p>
              </div>
              <span className="text-ink-3 shrink-0 font-mono text-[11px]">
                {event.next_card_sequence - 1} handed out
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
