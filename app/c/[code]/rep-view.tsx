'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Wordmark } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { COLOUR_HEX, type ColourTag } from '@/lib/domain/colours';
import { apiSend } from '@/lib/http/client';
import type { EventSummary } from '@/lib/db/rep';
import type { Resolved } from '@/lib/db/landing';

/**
 * The rep view of `/c/[code]` (spec §8).
 *
 * The rep taps the card on their OWN phone before handing it over. iOS opens the
 * URL; this is what they see. It must be near-zero friction — registration is the
 * only thing that has to happen while facing a prospect (§10.2), and the target
 * is under three seconds from tap to confirmation (§27).
 *
 * This render explicitly DOES NOT count as a tap (§10.4). The server never calls
 * record_prospect_view on this branch.
 */

type RepResolved = Extract<Resolved, { audience: 'rep' }>;

export function RepView({
  resolved,
  events,
  registeredBy,
}: {
  resolved: RepResolved;
  events: EventSummary[];
  registeredBy: string;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[34rem] flex-col px-5 pb-10">
      <header className="flex items-center justify-between pt-6">
        <Link href="/dashboard">
          <Wordmark />
        </Link>
        <span className="text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase">
          Your card
        </span>
      </header>

      <main className="flex flex-1 flex-col justify-center py-8">
        {resolved.session ? (
          <AlreadyRegistered session={resolved.session} />
        ) : resolved.cardStatus === 'voided' ? (
          <VoidedCard code={resolved.code} />
        ) : (
          <RegisterCard code={resolved.code} events={events} registeredBy={registeredBy} />
        )}
      </main>
    </div>
  );
}

function CardBadge({ sequence, colour }: { sequence: number; colour: string }) {
  const hex = COLOUR_HEX[colour as ColourTag] ?? '#6B7977';

  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 rounded-full ring-2 ring-white"
        style={{ backgroundColor: hex }}
      />
      <span className="font-display text-ink text-3xl font-bold tracking-tight">
        Card {sequence} — {colour}
      </span>
    </div>
  );
}

/**
 * Tapping a card that is already registered is nearly always a rep checking which
 * card this is. So this is a UI state, not an error page (§12.1).
 */
function AlreadyRegistered({ session }: { session: NonNullable<RepResolved['session']> }) {
  const who = [session.prospect_name, session.prospect_company].filter(Boolean).join(' at ');

  return (
    <div>
      <CardBadge sequence={session.event_sequence_number} colour={session.colour_tag} />

      <p className="text-ink-2 mt-3 text-[15px]">
        {who ? <span className="text-ink font-medium">{who}</span> : 'No details added yet'}
        <span className="text-ink-3"> · registered {relativeTime(session.registered_at)}</span>
      </p>

      <div className="mt-7 flex flex-col gap-2.5">
        <Link href={`/sessions/${session.id}/edit`} className="contents">
          <Button size="block">
            {session.details_completed_at ? 'Open session' : 'Add details'}
          </Button>
        </Link>
        <Link href="/dashboard" className="contents">
          <Button variant="secondary" size="block">
            Back to today
          </Button>
        </Link>
      </div>

      {session.first_viewed_at ? (
        <p className="bg-ok-bg text-ok mt-5 rounded-lg px-3 py-2.5 text-sm font-medium">
          They have tapped it — {relativeTime(session.first_viewed_at)}.
        </p>
      ) : null}

      {!session.details_completed_at && !session.first_viewed_at ? (
        <ReleaseCard sessionId={session.id} />
      ) : null}
    </div>
  );
}

/**
 * A card activated before the event but never handed out goes back into the pile
 * for the next one. Offered only while there is no sign it left the rep's hand;
 * the server re-checks (release_card).
 */
function ReleaseCard({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function release() {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/sessions/${sessionId}/release`, 'POST', {});
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not release. Try again.');
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-ink-3 hover:text-ink-2 mt-6 text-[13px] underline underline-offset-2"
      >
        Didn&rsquo;t hand this one out? Release it for another event
      </button>
    );
  }

  return (
    <div className="border-line mt-6 rounded-2xl border p-4">
      <p className="text-ink text-[15px] font-semibold">Is this card still in your hand?</p>
      <p className="text-ink-2 mt-1 text-[13px] leading-snug">
        Only release a card you&rsquo;re holding. If someone already has it, they would later see
        the next person&rsquo;s page.
      </p>
      <div className="mt-3 flex gap-2">
        <Button type="button" onClick={release} disabled={busy}>
          {busy ? 'Releasing…' : 'Yes, release it'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
      {error ? <p className="text-warn mt-2 text-[13px]">{error}</p> : null}
    </div>
  );
}

function VoidedCard({ code }: { code: string }) {
  return (
    <div>
      <h1 className="font-display text-ink text-2xl font-bold tracking-tight">
        This card was voided
      </h1>
      <p className="text-ink-2 mt-2 text-[15px]">
        Card <span className="font-mono">{code}</span> was marked as damaged, lost or
        mis-registered. Use a fresh card — this one cannot be reused.
      </p>
      <Link href="/dashboard" className="contents">
        <Button variant="secondary" size="block" className="mt-6">
          Back to today
        </Button>
      </Link>
    </div>
  );
}

function RegisterCard({
  code,
  events,
  registeredBy,
}: {
  code: string;
  events: EventSummary[];
  registeredBy: string;
}) {
  const router = useRouter();
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const [firstName, setFirstName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (events.length === 0) {
    return (
      <div>
        <h1 className="font-display text-ink text-2xl font-bold tracking-tight">
          Create an event first
        </h1>
        <p className="text-ink-2 mt-2 text-[15px]">
          Cards are numbered per event, so this card needs one to belong to.
        </p>
        <Link href="/events/new" className="contents">
          <Button size="block" className="mt-6">
            New event
          </Button>
        </Link>
      </div>
    );
  }

  async function register() {
    setBusy(true);
    setError(null);

    try {
      // The session id is generated HERE, on the device. That is what makes an
      // offline retry idempotent without a dedupe table (§15.4, §17.1) — and it
      // is why this contract is worth getting right before the outbox exists.
      const sessionId = crypto.randomUUID();

      const { session } = await apiSend<{ session: { id: string } }>(
        '/api/sessions/register',
        'POST',
        {
          session_id: sessionId,
          code,
          event_id: eventId,
          registered_by: registeredBy,
          first_name: firstName.trim() || undefined,
        },
      );

      router.replace(`/sessions/${session.id}/edit?registered=1`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not register. Try again in a moment.',
      );
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase">Card {code}</p>
      <h1 className="font-display text-ink mt-1 text-3xl font-bold tracking-tight">
        Register this card
      </h1>
      <p className="text-ink-2 mt-2 text-[15px]">
        Do this before you hand it over. Details can wait until you have stepped away.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {events.length > 1 ? (
          <Field label="Event" htmlFor="event">
            <select
              id="event"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/20 h-12 w-full rounded-lg border px-3 text-base focus:ring-2 focus:outline-none"
            >
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field
          label="Their first name"
          hint="Optional — two seconds now, a much easier memory later."
          htmlFor="firstName"
        >
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="off"
            enterKeyHint="done"
          />
        </Field>

        {error ? (
          <p
            className="bg-crit-bg text-crit rounded-lg px-3 py-2.5 text-sm font-medium"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <Button size="block" onClick={register} disabled={busy || !eventId}>
          {busy ? 'Registering…' : 'Register this card'}
        </Button>
      </div>
    </div>
  );
}

/** "4 minutes ago" — the only time format this app needs. */
function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
