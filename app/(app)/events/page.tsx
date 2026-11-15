import Link from 'next/link';
import { BackLink } from '@/components/back-link';
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
      <BackLink href="/dashboard">Today</BackLink>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <h1 className="font-display text-ink text-2xl font-bold tracking-tight">Events</h1>
        <Link href="/events/new" className={buttonStyles({ size: 'sm' })}>
          New event
        </Link>
      </div>

      <p className="text-ink-2 mt-2 text-sm">
        An event is a label and an optional goal. Cards tapped while it is on are filed under it.
      </p>

      {events.length === 0 ? (
        <div className="border-line bg-surface mt-6 rounded-xl border border-dashed p-6 text-center">
          <p className="text-ink font-medium">No events yet</p>
          <p className="text-ink-2 mt-1.5 text-sm">
            An event holds the niches and the problems you pick from when adding details. Without
            one, contacts go under &ldquo;Unsorted&rdquo;.
          </p>
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}/results`}
                className="border-line bg-surface hover:border-ink-3 flex flex-col items-start gap-1 rounded-xl border px-3.5 py-3"
              >
                <div className="w-full min-w-0">
                  <p className="text-ink line-clamp-2 text-[15px] font-medium wrap-anywhere">
                    {event.name}
                  </p>
                  <p className="text-ink-3 mt-0.5 text-[13px]">
                    {[
                      event.event_date
                        ? new Intl.DateTimeFormat('en-GB', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            timeZone: 'UTC',
                          })
                            .format(new Date(`${event.event_date}T00:00:00Z`))
                            .replace(',', '')
                        : null,
                      event.location,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'No date set'}
                  </p>
                </div>
                <span className="text-ink-3 text-[12px]">
                  {event.next_card_sequence - 1}
                  {event.target_cards ? ` of ${event.target_cards}` : ''} handed out · results →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
