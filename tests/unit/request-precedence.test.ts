import { expect, it } from 'vitest';
import {
  followupDraft,
  followupState,
  isActionable,
  type FollowupSession,
} from '@/lib/followup/state';
import { strongestSignal } from '@/lib/followup/signals';

const now = Date.parse('2026-11-14T12:00:00Z');
const base: FollowupSession = {
  id: 'one',
  status: 'active',
  details_completed_at: '2026-11-13T12:00:00Z',
  registered_at: '2026-11-13T12:00:00Z',
  first_viewed_at: null,
  followup_sent_at: null,
  followup_outcome: null,
  problems: [],
  prospect_submitted_email: null,
  prospect_submitted_phone: null,
};
const request = (status: string, created_at = '2026-11-14T10:00:00Z') => ({
  status,
  created_at,
  done_at: status === 'done' ? created_at : null,
});
it('puts an open request ahead of sent, questions and incomplete details', () => {
  const session = {
    ...base,
    details_completed_at: null,
    followup_sent_at: '2026-11-13T12:00:00Z',
    prospect_requests: [request('open')],
  };
  expect(followupState(session, [{ session_id: 'one', type: 'chat_turn' }], [], now)).toBe(
    'request-open',
  );
  expect(isActionable('request-open')).toBe(true);
  expect(
    strongestSignal({
      viewCount: 5,
      firstViewedAt: null,
      events: ['booking_opened'],
      questions: ['Price?'],
      submittedEmail: 'a@example.com',
      submittedPhone: null,
      openRequest: true,
    }).rank,
  ).toBe(7);
});
it.each(['done', 'withdrawn'] as const)(
  'suppresses ordinary follow-up and drafts after %s',
  (status) => {
    const state = followupState(
      { ...base, prospect_requests: [request(status)] },
      [{ session_id: 'one', type: 'chat_turn' }],
      [],
      now,
    )!;
    expect(state).toBe(`request-${status}`);
    expect(isActionable(state)).toBe(false);
    expect(
      followupDraft(
        base,
        state,
        { channel: 'email', prospectName: 'Tom', repFullName: 'Sam', businessName: 'Acme' },
        now,
      ),
    ).toBeNull();
  },
);
it('respects dropped, replied, booked and inactive precedence', () => {
  const session = { ...base, prospect_requests: [request('open')] };
  expect(followupState({ ...session, followup_outcome: 'dropped' }, [], [], now)).toBe('dropped');
  expect(followupState({ ...session, followup_outcome: 'replied' }, [], [], now)).toBe('replied');
  expect(followupState(session, [], [{ session_id: 'one', status: 'confirmed' }], now)).toBe(
    'booked',
  );
  expect(followupState({ ...session, status: 'voided' }, [], [], now)).toBeNull();
});
it('a fresh explicit request supersedes older done and withdrawn requests', () => {
  expect(
    followupState(
      { ...base, prospect_requests: [request('done', '2026-11-13T10:00:00Z'), request('open')] },
      [],
      [],
      now,
    ),
  ).toBe('request-open');
});
