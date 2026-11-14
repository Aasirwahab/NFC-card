import { describe, expect, it } from 'vitest';
import { composeFollowupDraft } from '@/lib/followup/draft';
import {
  followupDraft,
  followupReason,
  followupState,
  isActionable,
  type FollowupSession,
} from '@/lib/followup/state';

const now = Date.parse('2026-11-06T12:00:00Z');
const hour = 3_600_000;
const day = 24 * hour;
const base: FollowupSession = {
  id: 's1',
  status: 'active',
  details_completed_at: '2026-11-05T12:00:00Z',
  registered_at: '2026-11-05T12:00:00Z',
  first_viewed_at: null,
  followup_sent_at: null,
  followup_outcome: null,
  problems: ['Manual timesheets'],
};
const opened = { first_viewed_at: '2026-11-06T10:00:00Z' };
const sent = { followup_sent_at: '2026-11-03T12:00:00Z' };
const linkedin = [{ session_id: 's1', type: 'linkedin_opened' }];
const booked = [{ session_id: 's1', status: 'confirmed' }];
const identity = {
  channel: 'linkedin' as const,
  prospectName: 'Tom Smith',
  repFullName: 'Zaid Zameer',
  businessName: 'TMA',
};

describe('follow-up display precedence', () => {
  it.each([
    ['dropped', { ...opened, ...sent, followup_outcome: 'dropped' }, linkedin, booked, 'dropped'],
    ['replied', { ...opened, ...sent, followup_outcome: 'replied' }, linkedin, booked, 'replied'],
    ['booked before sent', { ...opened, ...sent }, linkedin, booked, 'booked'],
    ['rescheduled', {}, [], [{ session_id: 's1', status: 'rescheduled' }], 'booked'],
    ['cancelled', {}, [], [{ session_id: 's1', status: 'cancelled' }], 'due-no-tap'],
    [
      'cancelled but opened',
      opened,
      [],
      [{ session_id: 's1', status: 'cancelled' }],
      'opened-no-action',
    ],
    ['sent before opened', { ...opened, ...sent }, [], [], 'sent'],
    ['sent before due', sent, [], [], 'sent'],
    ['opened with LinkedIn click', opened, linkedin, [], 'review'],
    ['opened without action', opened, [], [], 'opened-no-action'],
    ['booking link alone', opened, [{ session_id: 's1', type: 'booking_opened' }], [], 'review'],
    ['due', {}, [], [], 'due-no-tap'],
    ['voided', { status: 'voided', ...sent }, [], booked, null],
    ['details incomplete', { details_completed_at: null }, [], [], null],
  ])('%s', (_label, patch, events, bookings, expected) => {
    expect(followupState({ ...base, ...patch }, events, bookings, now)).toBe(expected);
  });

  it.each([
    ['23h59', day - 60_000, null],
    ['24h exactly', day, 'due-no-tap'],
    ['30 days exactly', 30 * day, 'due-no-tap'],
    ['30 days and a millisecond', 30 * day + 1, null],
    ['registered in the future', -hour, null],
  ])('never opened, registered %s ago', (_label, age, expected) => {
    const session = { ...base, registered_at: new Date(now - age).toISOString() };
    expect(followupState(session, [], [], now)).toBe(expected);
  });

  it('ignores other sessions’ events and bookings', () => {
    const events = [{ session_id: 'other', type: 'linkedin_opened' }];
    const bookings = [{ session_id: 'other', status: 'confirmed' }];
    expect(followupState({ ...base, ...opened }, events, bookings, now)).toBe('opened-no-action');
  });

  it('queues only the three states the rep can act on', () => {
    expect((['due-no-tap', 'opened-no-action', 'review'] as const).every(isActionable)).toBe(true);
    expect((['booked', 'sent', 'replied', 'dropped'] as const).some(isActionable)).toBe(false);
  });

  it('gives a plain one-line reason', () => {
    expect(
      followupReason('due-no-tap', { ...base, registered_at: '2026-11-05T12:00:00Z' }, now),
    ).toBe('Not opened yet, met yesterday');
    expect(
      followupReason('due-no-tap', { ...base, registered_at: '2026-11-03T12:00:00Z' }, now),
    ).toBe('Not opened yet, met 3 days ago');
  });
});

describe('safe deterministic drafts', () => {
  const states = ['due-no-tap', 'opened-no-action', 'booked', 'sent', 'replied'] as const;

  it.each(states)('%s names the sender and ends with the stop line, on every channel', (state) => {
    for (const channel of ['linkedin', 'email', 'none'] as const) {
      const draft = composeFollowupDraft({
        ...identity,
        channel,
        problem: 'Manual timesheets',
        state,
      });
      expect(draft).toContain('Hi Tom,');
      expect(draft).toContain('Zaid, TMA');
      expect(draft).not.toContain('Zameer');
      expect(draft.endsWith("Reply stop and I won't write again.")).toBe(true);
      expect(draft).toContain('manual timesheets');
      expect(draft).not.toMatch(
        /opened|tracking|haven't looked|tracked|already prepared|put down a few thoughts/i,
      );
      if (channel === 'linkedin') expect(draft.length).toBeLessThanOrEqual(300);
    }
  });

  it('keeps a LinkedIn note short even with a long problem', () => {
    const draft = composeFollowupDraft({
      ...identity,
      problem: 'Keeping track of every machine and operator across eleven depots '.repeat(3),
      state: 'opened-no-action',
    });
    expect(draft.length).toBeLessThanOrEqual(300);
  });

  it('has no draft for dropped contacts, and a fixed draft for clicked rows', () => {
    expect(followupDraft({ ...base, ...opened }, 'dropped', identity, now)).toBeNull();
    expect(followupDraft({ ...base, ...opened }, 'review', identity, now)).toContain(
      'Following up on our chat',
    );
  });

  it('has no draft for replied contacts', () => {
    expect(
      followupDraft({ ...base, followup_outcome: 'replied' }, 'replied', identity, now),
    ).toBeNull();
  });

  it.each([3 * day - 1, 3 * day, 10 * day])('has no second-nudge draft %i ms after Done', (age) => {
    const session = { ...base, followup_sent_at: new Date(now - age).toISOString() };
    expect(followupDraft(session, 'sent', identity, now)).toBeNull();
  });

  it('uses only the ticked problem, never free text or the private note', () => {
    const session = {
      ...base,
      problems: [],
      custom_problems: 'SECRET FREE TEXT',
      memorable_info: 'PRIVATE NOTE',
    };
    for (const state of states) {
      const draft = followupDraft({ ...session, ...sent }, state, identity, now + 10 * day);
      expect(draft ?? '', state).not.toMatch(/SECRET FREE TEXT|PRIVATE NOTE|secret|private/i);
    }
    expect(followupDraft(session, 'due-no-tap', identity, now)).not.toContain(' on ');
  });

  it('still reads well with no names', () => {
    const draft = composeFollowupDraft({
      channel: 'email',
      prospectName: null,
      repFullName: 'Zaid',
      problem: null,
      businessName: null,
    });
    expect(draft.startsWith('Hi,')).toBe(true);
    expect(draft).not.toContain('null');
  });
});
