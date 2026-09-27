import { describe, expect, it } from 'vitest';
import { eventResults, percent, type ResultSession } from '@/lib/domain/event-results';

/**
 * Pilot results (§27, Phase 5b): the numbers the field pilot is judged on.
 */

const T0 = '2026-10-05T18:00:00Z';
const at = (hours: number) => new Date(Date.parse(T0) + hours * 3_600_000).toISOString();

function session(id: string, overrides: Partial<ResultSession> = {}): ResultSession {
  return {
    id,
    status: 'active',
    registered_at: T0,
    details_completed_at: null,
    first_viewed_at: null,
    first_view_source: null,
    chat_response_count: 0,
    domain_source: null,
    has_research: false,
    ...overrides,
  };
}

describe('eventResults', () => {
  const sessions = [
    session('a', {
      details_completed_at: at(12),
      first_viewed_at: at(20),
      first_view_source: 'nfc',
      chat_response_count: 2,
      domain_source: 'email',
      has_research: true,
    }),
    session('b', {
      details_completed_at: at(14),
      first_viewed_at: at(40),
      first_view_source: 'qr',
      domain_source: 'guess',
      has_research: true,
    }),
    session('c', { details_completed_at: at(16), has_research: true }),
    session('d'),
    session('e', { status: 'voided' }),
    session('f', { status: 'voided' }),
  ];

  const results = eventResults({
    sessions,
    events: [
      { session_id: 'a', type: 'booking_opened' },
      { session_id: 'a', type: 'booking_opened' }, // twice: still one prospect
      { session_id: 'b', type: 'linkedin_opened' },
      { session_id: 'f', type: 'released' },
      { session_id: 'e', type: 'booking_opened' }, // voided: not counted
    ],
    bookings: [
      { session_id: 'a', status: 'confirmed' },
      { session_id: 'b', status: 'cancelled' },
    ],
    ratings: [
      { session_id: 'a', rating: 1 },
      { session_id: 'b', rating: -1 },
    ],
  });

  it('counts only live sessions in the funnel', () => {
    expect(results).toMatchObject({
      registered: 4,
      detailsAdded: 3,
      opened: 2,
      clickedBook: 1,
      booked: 1,
      linkedinClicks: 1,
      chatUsed: 1,
    });
  });

  it('splits how cards were opened, and how the company was found', () => {
    expect(results.openedByNfc).toBe(1);
    expect(results.openedByQr).toBe(1);
    expect(results.research).toEqual({ website: 0, email: 1, guess: 1, none: 1 });
  });

  it('tells released cards apart from voided ones', () => {
    expect(results.released).toBe(1);
    expect(results.voided).toBe(1);
  });

  it('reports median times and ratings', () => {
    expect(results.medianHoursToOpen).toBe(30);
    expect(results.medianHoursToDetails).toBe(14);
    expect(results.ratedUp).toBe(1);
    expect(results.ratedDown).toBe(1);
  });

  it('copes with an event nobody has opened yet', () => {
    const empty = eventResults({ sessions: [session('x')], events: [], bookings: [], ratings: [] });
    expect(empty.medianHoursToOpen).toBeNull();
    expect(empty.opened).toBe(0);
  });
});

describe('percent', () => {
  it('rounds, and has no answer without a base', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBeNull();
  });
});
