import { FollowupCard } from '@/components/followup-card';
import { getBusinessProfile, getContactActivity, getProfile } from '@/lib/db/rep';
import type { Row } from '@/lib/db/types';
import { followupChannel } from '@/lib/followup/draft';
import {
  followupDraft,
  followupReason,
  followupState,
  type FollowupSession,
} from '@/lib/followup/state';
import { chatTurns, openingSummary, strongestSignal } from '@/lib/followup/signals';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/London',
});

function RecordedTime({ value }: { value: string }) {
  return <time dateTime={value}>{dateFormat.format(new Date(value))} (UK time)</time>;
}

/** Mounted by the server page, independently of the contact details form. */
export async function WhatTheyDid({
  userId,
  session,
  cardCode,
}: {
  userId: string;
  session: FollowupSession &
    Pick<
      Row<'sessions'>,
      | 'prospect_name'
      | 'prospect_company'
      | 'prospect_email'
      | 'linkedin_url'
      | 'event_sequence_number'
      | 'colour_tag'
    >;
  cardCode: string | null;
}) {
  let loaded;
  try {
    loaded = await Promise.all([
      getContactActivity(userId, session.id),
      getProfile(userId),
      getBusinessProfile(userId),
    ]);
  } catch {
    return (
      <section className="border-line mt-6 border-t pt-5">
        <h2 className="text-ink text-base font-semibold">What they did</h2>
        <p className="text-ink-2 mt-2 text-sm" role="status">
          Could not load activity. Refresh to try again.
        </p>
      </section>
    );
  }
  const [activity, profile, business] = loaded;
  if (!activity) return null;

  const opens = openingSummary(activity.view_count, activity.first_viewed_at);
  const turns = chatTurns(activity.chat_messages, activity.chat_unanswered);
  const events = activity.session_events.map((e) => ({ ...e, session_id: session.id }));
  const noteEmailed = events.some((e) => e.type === 'prospect_note_emailed');
  const signal = strongestSignal({
    viewCount: activity.view_count,
    firstViewedAt: activity.first_viewed_at,
    events: events.map((e) => e.type),
    questions: turns.map((t) => t.question),
    submittedEmail: session.prospect_submitted_email,
    submittedPhone: session.prospect_submitted_phone,
  });
  const requestedNote = Boolean(
    (session.prospect_submitted_email || session.prospect_submitted_phone) && !noteEmailed,
  );
  const channel = followupChannel(session);
  const now = activity.readAt;
  const state =
    followupState(session, events, activity.bookings, now) ??
    (session.status === 'active' && session.details_completed_at ? 'due-no-tap' : null);
  const draft = state
    ? followupDraft(
        session,
        state,
        {
          channel,
          prospectName: session.prospect_name,
          repFullName: profile?.full_name?.trim() || 'the team',
          businessName: business?.company_name ?? null,
        },
        now,
        turns.at(-1)?.question,
      )
    : null;

  return (
    <section aria-labelledby="what-they-did" className="border-line mt-6 min-w-0 border-t pt-5">
      <h2 id="what-they-did" className="text-ink text-lg font-semibold">
        What they did
      </h2>
      <p className="text-ink-2 mt-2 text-sm">{opens.count}</p>
      {opens.first ? (
        <p className="text-ink-3 mt-1 text-sm">
          First opened: <RecordedTime value={opens.first} />
        </p>
      ) : null}
      {opens.last ? (
        <p className="text-ink-3 mt-1 text-sm">
          Last opened: <RecordedTime value={opens.last} />
        </p>
      ) : activity.view_count > 1 ? (
        <p className="text-ink-3 mt-1 text-sm">Last opened: time not recorded.</p>
      ) : null}

      {session.prospect_submitted_email || session.prospect_submitted_phone ? (
        <div className="mt-5 text-sm wrap-anywhere">
          <h3 className="text-ink font-semibold">
            {noteEmailed ? 'We emailed them their note' : 'Asked you to send their note'}
          </h3>
          {session.prospect_submitted_email ? (
            <p className="text-ink-2 mt-1">{session.prospect_submitted_email}</p>
          ) : null}
          {session.prospect_submitted_phone ? (
            <p className="text-ink-2 mt-1">{session.prospect_submitted_phone}</p>
          ) : null}
        </div>
      ) : null}

      <h3 className="text-ink mt-5 text-sm font-semibold">Buttons pressed</h3>
      <ul className="text-ink-2 mt-2 space-y-1 text-sm">
        {(
          [
            ['booking_opened', 'Opened the booking page'],
            ['linkedin_opened', 'Pressed LinkedIn'],
            ['page_emailed', 'Emailed the page'],
          ] as const
        ).map(([type, label]) => {
          const count = Math.max(
            0,
            events.filter((e) => e.type === type).length -
              (type === 'page_emailed' && noteEmailed ? 1 : 0),
          );
          return (
            <li key={type}>
              {label}: {count === 0 ? 'not recorded' : `${count} ${count === 1 ? 'time' : 'times'}`}
            </li>
          );
        })}
      </ul>

      <h3 className="text-ink mt-5 text-sm font-semibold">Their chat</h3>
      {turns.length ? (
        <ol className="divide-line mt-2 divide-y">
          {turns.map((turn) => (
            <li key={turn.id} className="py-3 text-sm wrap-anywhere">
              <p className="text-ink-3 mb-1 text-xs">
                <RecordedTime value={turn.createdAt} />
              </p>
              <p className="text-ink whitespace-pre-wrap">
                <span className="font-semibold">They asked: </span>
                {turn.question}
              </p>
              <p className="text-ink-2 mt-2 whitespace-pre-wrap">
                <span className="font-semibold">Chat answered: </span>
                {turn.answer ?? 'No answer recorded.'}
              </p>
              {turn.unanswered ? (
                <p className="text-warn mt-2 font-medium">Chat could not answer fully.</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-ink-3 mt-2 text-sm">No chat questions recorded.</p>
      )}

      {state ? (
        <div className="mt-5">
          <h3 className="text-ink text-base font-semibold">Follow up</h3>
          <p className="text-ink-3 mt-1 text-sm">
            Send opens their email or text message if they left one, or your share sheet. You can
            also copy the message. Tap Done once you have sent it.
          </p>
          <FollowupCard
            row={{
              sessionId: session.id,
              state,
              reason: followupReason(state, session, now),
              signal,
              draft,
              channel,
              pagePath: cardCode ? `/c/${cardCode}` : null,
              prospectName: session.prospect_name,
              prospectCompany: session.prospect_company,
              prospectEmail: requestedNote
                ? session.prospect_submitted_email
                : session.prospect_email,
              prospectPhone: requestedNote ? session.prospect_submitted_phone : null,
              preferContact: requestedNote,
              linkedinUrl: session.linkedin_url,
              sequence: session.event_sequence_number,
              colour: session.colour_tag,
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
