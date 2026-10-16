import { expect, it } from 'vitest';
import { pilotRow } from '@/lib/insignar/pilot-request';

it('maps a valid landing request to an early-access row', () => {
  expect(
    pilotRow({ name: ' Maya Okafor ', email: 'Maya@Calder.co', company: 'Calder', reps: '3' }),
  ).toEqual({
    name: 'Maya Okafor',
    email: 'maya@calder.co',
    role: 'Pilot request · Calder · team of 3',
    next_event: null,
    ref: 'insignar-landing',
  });
  expect(pilotRow({ name: 'Zaid', email: 'z@x.io', company: 'Solo', reps: '' })?.role).toBe(
    'Pilot request · Solo',
  );
});

it('rejects missing, malformed or oversized input', () => {
  for (const body of [
    {},
    { name: 'A', email: 'nope', company: 'C' },
    { name: 'A', email: 'a@b.co', company: '' },
    { name: 'A', email: 'a@b.co', company: 'C', reps: 'three' },
    { name: 'x'.repeat(101), email: 'a@b.co', company: 'C' },
    { name: 'A', email: 'a@b.co', company: 'C'.repeat(121) },
  ]) {
    expect(pilotRow(body)).toBeNull();
  }
});
