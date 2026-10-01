import { BackLink } from '@/components/back-link';
import { EventForm } from './event-form';

export const metadata = { title: 'New event' };

export default function NewEventPage() {
  return (
    <div>
      <BackLink href="/events">Events</BackLink>
      <h1 className="font-display text-ink mt-3 text-2xl font-bold tracking-tight">New event</h1>
      <p className="text-ink-2 mt-2 mb-5 text-sm">
        Set this up before you leave. The niches are what you tap at the table.
      </p>
      <EventForm />
    </div>
  );
}
