import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import EventsPage from '@/app/(app)/events/page';
const mocks = vi.hoisted(() => ({ events: vi.fn() }));
vi.mock('@/lib/db/server', () => ({ requireRep: async () => ({ userId: 'rep' }) }));
vi.mock('@/lib/db/rep', () => ({ listEvents: mocks.events }));

it.each([
  ['2024-11-14', 'Thu 14 Nov'],
  ['2026-01-01', 'Thu 1 Jan'],
  ['2028-02-29', 'Tue 29 Feb'],
  [null, 'No date set'],
])('formats the calendar date %s in UK order without a timezone shift', async (date, expected) => {
  const name = 'North West Small Business and Enterprise Networking Evening at the Town Hall';
  mocks.events.mockResolvedValue([
    { id: 'event', name, event_date: date, location: null, next_card_sequence: 1 },
  ]);
  const html = renderToStaticMarkup(await EventsPage());
  expect(html).toContain(expected);
  expect(html).toContain(name);
  expect(html).toContain('line-clamp-2');
  expect(html).not.toContain('truncate');
  if (date) expect(html).not.toContain(date);
});
