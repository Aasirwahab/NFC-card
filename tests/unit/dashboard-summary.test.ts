import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/(app)/dashboard/page';

const mocks = vi.hoisted(() => ({ sessions: vi.fn(), followups: vi.fn(), requests: vi.fn() }));
vi.mock('@/lib/db/requests', () => ({ listProspectRequests: mocks.requests }));
vi.mock('@/lib/db/server', () => ({ requireRep: async () => ({ userId: 'rep' }) }));
vi.mock('@/lib/db/rep', () => ({
  listEvents: async () => [],
  listSessions: mocks.sessions,
  listFollowups: mocks.followups,
  getSetupProgress: async () => ({ booking: true }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/components/card-code-lookup', () => ({ CardCodeLookup: () => null }));
vi.mock('@/components/first-run-checklist', () => ({ FirstRunChecklist: () => null }));
vi.mock('@/components/session-row', () => ({ SessionRow: () => null }));
vi.mock('@/components/tap-guide', () => ({ TapGuide: () => null }));

beforeEach(() => {
  mocks.requests.mockResolvedValue([]);
  mocks.sessions.mockResolvedValue([]);
  mocks.followups.mockResolvedValue({ actionable: [], history: [] });
});

it('puts follow-up and needs-details lists before setup and card lookup', async () => {
  mocks.sessions.mockResolvedValue([
    { id: 'details', details_completed_at: null },
    { id: 'reach', details_completed_at: 'saved' },
    { id: 'follow', details_completed_at: 'saved', prospect_email: 'tom@example.com' },
  ]);
  mocks.followups.mockResolvedValue({
    actionable: [{ sessionId: 'follow', state: 'review', signal: { label: 'Asked a question' } }],
    history: [],
  });
  const html = renderToStaticMarkup(
    await DashboardPage({ searchParams: Promise.resolve({}) } as never),
  );
  const nav = html.match(/<nav[^>]*aria-label="Contact summary"[^>]*>(.*?)<\/nav>/)![1]!;
  expect(nav).toContain('href="#needs-details"');
  expect(nav).toContain('1 need details');
  expect(nav).toContain('href="#needs-contact"');
  expect(nav).toContain('1 need a way to reach them');
  expect(nav).toContain('href="#follow-up"');
  expect(nav).toContain('1 to follow up');
  expect(nav).not.toContain('·');
  expect(html.indexOf('id="needs-details"')).toBeLessThan(html.indexOf('Add a contact:'));
  expect(html.indexOf('<nav')).toBeLessThan(html.indexOf('Add a contact:'));
  const sections = [...html.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
  expect(sections).toEqual(['follow-up', 'needs-details', 'needs-contact', 'other-contacts']);
});

it('hides empty groups from the summary and hides the empty summary', async () => {
  let html = renderToStaticMarkup(
    await DashboardPage({ searchParams: Promise.resolve({}) } as never),
  );
  expect(html).not.toContain('Contact summary');
  mocks.sessions.mockResolvedValue([{ id: 'details', details_completed_at: null }]);
  html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) } as never));
  const nav = html.match(/<nav[^>]*aria-label="Contact summary"[^>]*>(.*?)<\/nav>/)![1]!;
  expect(nav).toContain('1 need details');
  expect(nav).not.toContain('#needs-contact');
  expect(nav).not.toContain('#follow-up');
});

it('gives a new rep a first-card instruction instead of saying caught up', async () => {
  const html = renderToStaticMarkup(
    await DashboardPage({ searchParams: Promise.resolve({}) } as never),
  );
  expect(html).toContain('Hand out your first card.');
  expect(html).toContain('Tap a card, then hand it over');
  expect(html).not.toContain('All caught up.');
});

it('keeps caught-up wording for existing contacts with no missing details', async () => {
  mocks.sessions.mockResolvedValue([
    { id: 'saved', details_completed_at: 'saved', prospect_email: 'tom@example.com' },
  ]);
  const html = renderToStaticMarkup(
    await DashboardPage({ searchParams: Promise.resolve({}) } as never),
  );
  expect(html).toContain('All caught up.');
});

it('puts explicit requests above the summary and every ordinary signal, including when filtered', async () => {
  mocks.requests.mockResolvedValue([
    {
      id: 'r1',
      sessionId: 's1',
      kind: 'details',
      channel: 'text',
      contact: '+447700900123',
      bestTime: 'today',
      prospectName: 'Tom',
      repFullName: 'Sam',
      businessName: 'Acme',
      eventName: 'Expo',
      pagePath: '/c/ABCD2345',
    },
  ]);
  mocks.sessions.mockResolvedValue([
    { id: 's1', details_completed_at: 'saved', prospect_email: 'tom@example.com' },
  ]);
  const html = renderToStaticMarkup(
    await DashboardPage({ searchParams: Promise.resolve({ event: 'another-event' }) } as never),
  );
  expect(html.indexOf('aria-label="Contact requests"')).toBeLessThan(
    html.indexOf('aria-label="Contact summary"'),
  );
  expect(html).toContain('asked you to send the details');
  expect(html).not.toContain('All caught up.');
});
