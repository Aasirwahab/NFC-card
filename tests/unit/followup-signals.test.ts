import { describe, expect, it } from 'vitest';
import { strongestSignal, chatTurns, openingSummary } from '@/lib/followup/signals';

const empty = { viewCount: 0, firstViewedAt: null, events: [], questions: [] };

describe('recorded contact signals', () => {
  it('ranks questions, booking clicks, LinkedIn, emailed pages, opens, then nothing', () => {
    const inputs = [
      { ...empty, questions: ['How much does it cost?'], events: ['booking_opened'] },
      { ...empty, events: ['booking_opened', 'linkedin_opened'] },
      { ...empty, events: ['linkedin_opened', 'page_emailed'] },
      { ...empty, events: ['page_emailed'], viewCount: 3 },
      { ...empty, viewCount: 3 },
      empty,
    ];
    const signals = inputs.map(strongestSignal);
    expect(signals.map((s) => s.label)).toEqual([
      'Asked about pricing',
      'Opened the booking page',
      'Pressed LinkedIn',
      'Emailed the page',
      'Opened 3 times',
      'Not opened yet',
    ]);
    expect([...signals].reverse().sort((a, b) => b.rank - a.rank)).toEqual(signals);
  });

  it('describes other questions without guessing their topic or intent', () => {
    expect(strongestSignal({ ...empty, questions: ['Does this work offline?'] }).label).toBe(
      'Asked a question',
    );
    expect(strongestSignal({ ...empty, firstViewedAt: '2026-11-06T10:00:00Z' }).label).toBe(
      'Opened once',
    );
  });

  it('never invents a last-open time from a count or a button click', () => {
    expect(openingSummary(3, '2026-11-06T10:00:00Z')).toEqual({
      count: 'Opened 3 times',
      first: '2026-11-06T10:00:00Z',
      last: null,
    });
    expect(openingSummary(1, '2026-11-06T10:00:00Z').last).toBe('2026-11-06T10:00:00Z');
    expect(openingSummary(0, null)).toEqual({ count: 'Not opened yet', first: null, last: null });
  });

  it('pairs answers in id order when timestamps tie, and marks recorded unanswered questions', () => {
    const at = '2026-11-06T10:00:00Z';
    const messages = [
      { id: 4, role: 'assistant', content: 'Please ask the rep.', created_at: at },
      { id: 2, role: 'assistant', content: 'Yes.', created_at: at },
      { id: 3, role: 'user', content: 'What is the price?', created_at: at },
      { id: 1, role: 'user', content: 'Does this work?', created_at: at },
    ];
    expect(chatTurns(messages, [{ question: 'What is the price?', created_at: at }])).toEqual([
      { id: 1, question: 'Does this work?', answer: 'Yes.', createdAt: at, unanswered: false },
      {
        id: 3,
        question: 'What is the price?',
        answer: 'Please ask the rep.',
        createdAt: at,
        unanswered: true,
      },
    ]);
    expect(messages[0]!.id).toBe(4);
  });

  it('keeps missing answers explicit and recognises fixed fallback replies without inventing answers', () => {
    const messages = [
      { id: 1, role: 'user', content: 'Missing answer?', created_at: '2026-11-06T09:00:00Z' },
      { id: 2, role: 'user', content: 'Can you help?', created_at: '2026-11-06T10:00:00Z' },
      {
        id: 3,
        role: 'assistant',
        content:
          'I can’t confirm that here. Zaid can help with the detail — use the contact options on this page.',
        created_at: '2026-11-06T10:00:00Z',
      },
    ];
    const turns = chatTurns(messages, []);
    expect(turns[0]!.answer).toBeNull();
    expect(turns[1]!.unanswered).toBe(true);
  });

  it('keeps concurrently recorded turns together even when their ids interleave', () => {
    const first = '2026-11-06T10:00:00.001Z';
    const second = '2026-11-06T10:00:00.002Z';
    const turns = chatTurns(
      [
        { id: 1, role: 'user', content: 'First question', created_at: first },
        { id: 2, role: 'user', content: 'Second question', created_at: second },
        { id: 3, role: 'assistant', content: 'First answer', created_at: first },
        { id: 4, role: 'assistant', content: 'Second answer', created_at: second },
      ],
      [],
    );
    expect(turns.map((t) => [t.question, t.answer])).toEqual([
      ['First question', 'First answer'],
      ['Second question', 'Second answer'],
    ]);
  });

  it('marks the right repeated question using the recorded unanswered time, even if resolved later', () => {
    const at = '2026-11-06T10:00:00Z';
    const later = '2026-11-06T11:00:00Z';
    const turns = chatTurns(
      [
        { id: 1, role: 'user', content: 'Same question?', created_at: at },
        { id: 2, role: 'assistant', content: 'Some detail was missing.', created_at: at },
        { id: 3, role: 'user', content: 'Same question?', created_at: later },
        { id: 4, role: 'assistant', content: 'An answer.', created_at: later },
      ],
      [{ question: 'Same question?', created_at: '2026-11-06T10:00:01Z' }],
    );
    expect(turns.map((t) => t.unanswered)).toEqual([true, false]);
  });
});
