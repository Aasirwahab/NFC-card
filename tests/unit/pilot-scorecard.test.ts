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
): ScorecardSession {
  return {
    ...base,
    id,
    user_id,
    status,
    registered_at: '2026-10-01T10:00:00Z',
    first_viewed_at: opened,
  };
}

describe('pilotScorecard', () => {
  const sessions = [
    session('a1', 'zaid', '2026-10-01T18:00:00Z'), // opened within 24 h
    session('a2', 'zaid', '2026-10-03T09:00:00Z'), // opened after two days
    session('a3', 'zaid', null),
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
      registered: 3,
      opened: 2,
      openedWithin24h: 1,
      clickedBook: 1,
      booked: 1,
    });

    const adam = card.reps.find((r) => r.userId === 'adam')!.results;
    // The voided card's click and booking are not part of how the pilot went.
    expect(adam).toMatchObject({
      registered: 1,
      opened: 1,
      openedWithin24h: 1,
      clickedBook: 0,
      booked: 0,
      voided: 1,
    });
  });

  it('totals across reps, busiest rep first', () => {
    expect(card.total).toMatchObject({ registered: 4, opened: 3, openedWithin24h: 2, booked: 1 });
    expect(card.reps.map((r) => r.userId)).toEqual(['zaid', 'adam']);
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
