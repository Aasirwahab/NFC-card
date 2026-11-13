import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WhatTheyDid } from '@/components/what-they-did';
import type { FollowupRow } from '@/lib/db/rep';

const mocks = vi.hoisted(() => ({
  activity: vi.fn(),
  followup: vi.fn<(props: { row: FollowupRow }) => null>(() => null),
}));
vi.mock('@/lib/db/rep', () => ({
  getContactActivity: mocks.activity,
  getProfile: async () => ({ full_name: 'Zaid' }),
  getBusinessProfile: async () => ({ company_name: null }),
}));
vi.mock('@/components/followup-card', () => ({ FollowupCard: mocks.followup }));

const session = {
  id: 'contact',
  status: 'active',
  user_id: 'rep',
  details_completed_at: '2026-11-10T12:00:00Z',
  registered_at: '2026-11-10T12:00:00Z',
  first_viewed_at: '2026-11-11T12:00:00Z',
  followup_sent_at: null,
  followup_outcome: null,
  prospect_name: 'Tom',
  prospect_company: null,
  prospect_email: null,
  linkedin_url: null,
  event_sequence_number: 1,
  colour_tag: 'Blue',
  problems: [],
};
const at = '2026-11-11T12:00:00Z';
const activity = {
  view_count: 3,
  first_viewed_at: at,
  readAt: Date.parse('2026-11-13T12:00:00Z'),
  session_events: [{ type: 'booking_opened', occurred_at: at }],
  chat_messages: [
    { id: 1, role: 'user', content: '<script>Price?</script>', created_at: at },
    { id: 2, role: 'assistant', content: 'Please ask Zaid.', created_at: at },
  ],
  chat_unanswered: [{ question: '<script>Price?</script>', created_at: at }],
  bookings: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.activity.mockResolvedValue(activity);
});

describe('What they did on the contact page', () => {
  it('renders recorded counts, Q&A and handoffs, escapes prospect text, and supplies the send draft', async () => {
    const html = renderToStaticMarkup(
      await WhatTheyDid({ userId: 'rep', session, cardCode: 'abc' }),
    );
    expect(mocks.activity).toHaveBeenCalledWith('rep', 'contact');
    expect(html).toContain('Opened 3 times');
    expect(html).toContain('Last opened: time not recorded.');
    expect(html).toContain('Opened the booking page');
    expect(html).toContain('Please ask Zaid.');
    expect(html).toContain('Chat could not answer fully.');
    expect(html).toContain('&lt;script&gt;Price?&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(mocks.followup.mock.calls[0]![0].row).toMatchObject({
      pagePath: '/c/abc',
      signal: { label: 'Asked about pricing' },
      draft: expect.stringContaining('You asked:'),
    });
  });

  it('renders nothing for a contact outside the owner query', async () => {
    mocks.activity.mockResolvedValue(null);
    expect(await WhatTheyDid({ userId: 'other', session, cardCode: 'abc' })).toBeNull();
    expect(mocks.followup).not.toHaveBeenCalled();
  });

  it('shows a read failure instead of an empty activity claim', async () => {
    mocks.activity.mockRejectedValue(new Error('unavailable'));
    const html = renderToStaticMarkup(
      await WhatTheyDid({ userId: 'rep', session, cardCode: 'abc' }),
    );
    expect(html).toContain('Could not load activity. Refresh to try again.');
    expect(html).not.toContain('Not opened yet');
    expect(mocks.followup).not.toHaveBeenCalled();
  });
});
