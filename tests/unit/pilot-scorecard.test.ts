import { describe, expect, it } from 'vitest';
import {
  bookedPer10Opened,
  pilotScorecard,
  type ScorecardSession,
} from '@/lib/domain/pilot-scorecard';

const base = {
  details_completed_at: null,
  first_view_source: 'nfc',
  chat_response_count: 0,
  domain_source: null,
  has_research: false,
} as const;

function session(
  id: string,
  user_id: string,
  opened: string | null,
  status = 'active',
  registered_by = 'Rep',
  followup_sent_at: string | null = null,
): ScorecardSession {
  return {
    ...base,
    id,
    user_id,
    status,
    registered_by,
    registered_at: '2026-10-01T10:00:00Z',
    first_viewed_at: opened,
    followup_sent_at,
  };
}

describe('pilotScorecard', () => {
  const sessions = [
    session('a1', 'zaid', '2026-10-01T18:00:00Z'), // opened within 24 h
    session('a2', 'zaid', '2026-10-03T09:00:00Z'), // opened after two days
    session('a3', 'zaid', null),
    session('a4', 'zaid', '2026-10-01T10:00:20Z', 'active', 'prospect_tap'), // prospect tapped first
    session('b1', 'adam', '2026-10-01T11:00:00Z'),
    session('b2', 'adam', '2026-10-01T12:00:00Z', 'voided'),
  ];
  const events = [
    { session_id: 'a1', type: 'booking_opened' },
    { session_id: 'a1', type: 'booking_opened' },
    { session_id: 'b2', type: 'booking_opened' },
  ];
  const bookings = [
    { session_id: 'a1', status: 'confirmed' },
    { session_id: 'b2', status: 'confirmed' },
    { session_id: null, status: 'confirmed' },
  ];

  const card = pilotScorecard({ sessions, events, bookings });

  it('splits counts per rep and counts each prospect once', () => {
    const zaid = card.reps.find((r) => r.userId === 'zaid')!.results;
    expect(zaid).toMatchObject({
      registered: 4,
      opened: 3,
      repFirst: 3,
      repFirstOpened: 2,
      repFirstOpenedWithin24h: 1,
      // Opened 20 seconds after "registration": the prospect's own tap, so it is
      // kept out of the opened-later numbers.
      prospectFirst: 1,
      clickedBook: 1,
      booked: 1,
    });

    const adam = card.reps.find((r) => r.userId === 'adam')!.results;
    // The voided card's click and booking are not part of how the pilot went.
    expect(adam).toMatchObject({
      registered: 1,
      opened: 1,
      repFirst: 1,
      repFirstOpenedWithin24h: 1,
      prospectFirst: 0,
      clickedBook: 0,
      booked: 0,
      voided: 1,
    });
  });

  it('totals across reps, busiest rep first', () => {
    expect(card.total).toMatchObject({
      registered: 5,
      opened: 4,
      repFirst: 4,
      repFirstOpened: 3,
      repFirstOpenedWithin24h: 2,
      prospectFirst: 1,
      booked: 1,
    });
    expect(card.reps.map((r) => r.userId)).toEqual(['zaid', 'adam']);
  });

  it('counts followed up as distinct live sessions the rep confirmed, apart from opened and acted', () => {
    const followed = pilotScorecard({
      sessions: [
        session('f1', 'zaid', null, 'active', 'Rep', '2026-10-02T10:00:00Z'),
        session('f2', 'zaid', '2026-10-01T18:00:00Z', 'active', 'Rep', '2026-10-02T10:00:00Z'),
        session('f3', 'zaid', '2026-10-01T18:00:00Z'),
        session('f4', 'adam', null, 'voided', 'Rep', '2026-10-02T10:00:00Z'),
      ],
      events: [
        { session_id: 'f2', type: 'booking_opened' },
        { session_id: 'f2', type: 'linkedin_opened' },
        { session_id: 'f2', type: 'linkedin_opened' },
        { session_id: 'f3', type: 'linkedin_opened' },
        { session_id: 'f4', type: 'linkedin_opened' },
      ],
      bookings: [],
    });
    expect(followed.total).toMatchObject({ followedUp: 2, opened: 2, acted: 2, booked: 0 });
    expect(followed.reps.find((r) => r.userId === 'zaid')!.results.followedUp).toBe(2);
    expect(followed.reps.find((r) => r.userId === 'adam')!.results.followedUp).toBe(0);
  });

  it('gives meetings per 10 opened, or null with nothing opened', () => {
    expect(bookedPer10Opened({ booked: 1, opened: 3 })).toBe(3.3);
    expect(bookedPer10Opened({ booked: 0, opened: 0 })).toBeNull();
  });

  it('is empty with no sessions', () => {
    const empty = pilotScorecard({ sessions: [], events: [], bookings: [] });
    expect(empty.reps).toEqual([]);
    expect(empty.total.registered).toBe(0);
  });
});
