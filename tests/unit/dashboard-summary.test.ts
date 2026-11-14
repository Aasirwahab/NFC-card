import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/(app)/dashboard/page';

const mocks = vi.hoisted(() => ({ sessions: vi.fn(), followups: vi.fn() }));
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
  mocks.sessions.mockResolvedValue([]);
  mocks.followups.mockResolvedValue({ actionable: [], history: [] });
});

it('links nonempty groups at the top without reordering the lists', async () => {
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
  expect(html.indexOf('<nav')).toBeLessThan(html.indexOf('Add a contact:'));
  const sections = [...html.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
  expect(sections).toEqual(['needs-details', 'needs-contact', 'follow-up', 'other-contacts']);
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
