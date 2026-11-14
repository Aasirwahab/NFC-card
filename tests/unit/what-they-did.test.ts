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
vi.mock('@/app/(app)/settings/actions', () => ({ saveKnowledgeAction: vi.fn() }));

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
  prospect_submitted_email: null,
  prospect_submitted_phone: null,
  linkedin_url: null,
  event_sequence_number: 1,
  colour_tag: 'Blue',
  problems: [],
};
const at = '2026-11-11T12:00:00Z';
const activity = {
  view_count: 3,
  first_viewed_at: at,
  last_viewed_at: null,
  readAt: Date.parse('2026-11-13T12:00:00Z'),
  session_events: [{ type: 'booking_opened', occurred_at: at }],
  chat_messages: [
    { id: 1, role: 'user', content: '<script>Price?</script>', created_at: at },
    { id: 2, role: 'assistant', content: 'Please ask Zaid.', created_at: at },
  ],
  chat_unanswered: [
    {
      id: 1,
      question: '<script>Price?</script>',
      created_at: at,
      handed_off: true,
      resolved_at: null,
      saved_answer: null,
    },
  ],
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
    expect(html).not.toContain('Last opened');
    expect(html).toContain('Opened the booking page: 1 time');
    expect(html).not.toContain('Pressed LinkedIn');
    expect(html).not.toContain('Emailed the page');
    expect(html).not.toContain('No buttons pressed yet.');
    expect(html).toContain('Please ask Zaid.');
    expect(html).toContain('Answer this');
    expect(html).toContain('Passed to you.');
    expect(html).toContain('Chat could not answer fully.');
    expect(html).toContain('&lt;script&gt;Price?&lt;/script&gt;');
    expect(html).not.toContain('<script>Price?</script>');
    expect(mocks.followup.mock.calls[0]![0].row).toMatchObject({
      pagePath: '/c/abc',
      signal: { label: 'Asked about pricing' },
      draft: expect.stringContaining('You asked:'),
    });
  });

  it('shows the recorded last opening in UK time and the follow-up signal', async () => {
    mocks.activity.mockResolvedValue({
      ...activity,
      readAt: Date.parse('2026-11-13T16:00:00Z'),
      last_viewed_at: '2026-11-13T14:02:00Z',
      chat_messages: [],
      session_events: [],
    });
    const html = renderToStaticMarkup(
      await WhatTheyDid({ userId: 'rep', session, cardCode: 'abc' }),
    );
    expect(html).toContain(
      'Last opened <time dateTime="2026-11-13T14:02:00Z">today at 14:02</time>',
    );
    expect(mocks.followup.mock.calls[0]![0].row.signal.label).toBe('Opened 3 times, last today');
    expect(html).toContain('No buttons pressed yet.');
  });

  it('uses the contact they left when they asked for their note', async () => {
    const html = renderToStaticMarkup(
      await WhatTheyDid({
        userId: 'rep',
        cardCode: 'abc',
        session: {
          ...session,
          prospect_email: 'saved@example.com',
          prospect_submitted_email: 'left@example.com',
          prospect_submitted_phone: '+447700900123',
        },
      }),
    );
    expect(html).toContain('Asked you to send their note');
    expect(html).toContain('left@example.com');
    expect(html).toContain('+447700900123');
    expect(mocks.followup.mock.calls[0]![0].row).toMatchObject({
      prospectEmail: 'left@example.com',
      prospectPhone: '+447700900123',
      preferContact: true,
      signal: { label: 'Asked you to send their note', rank: 6 },
      draft:
        "Hi Tom,\n\nHere is your note from our conversation.\n\nZaid\n\nReply stop and I won't write again.",
    });
  });

  it('uses the saved email for ordinary follow-ups after note delivery', async () => {
    mocks.activity.mockResolvedValue({
      ...activity,
      session_events: [{ type: 'prospect_note_emailed', occurred_at: at }],
    });
    renderToStaticMarkup(
      await WhatTheyDid({
        userId: 'rep',
        cardCode: 'abc',
        session: {
          ...session,
          prospect_email: 'saved@example.com',
          prospect_submitted_email: 'left@example.com',
          prospect_submitted_phone: '+447700900123',
        },
      }),
    );
    expect(mocks.followup.mock.calls[0]![0].row).toMatchObject({
      prospectEmail: 'saved@example.com',
      prospectPhone: null,
      preferContact: false,
    });
  });
  it('shows automatic delivery in the activity block', async () => {
    mocks.activity.mockResolvedValue({
      ...activity,
      chat_messages: [],
      session_events: [
        { type: 'prospect_note_emailed', occurred_at: at },
        { type: 'page_emailed', occurred_at: at },
      ],
    });
    const html = renderToStaticMarkup(
      await WhatTheyDid({
        userId: 'rep',
        cardCode: 'abc',
        session: { ...session, prospect_submitted_email: 'left@example.com' },
      }),
    );
    expect(html).toContain('We emailed them their note');
    expect(html).toContain('No buttons pressed yet.');
    expect(html).not.toContain('Emailed the page');
    expect(html).not.toContain('Opened the booking page');
    expect(html).not.toContain('Pressed LinkedIn');
    expect(mocks.followup.mock.calls[0]![0].row.signal.rank).toBe(1);
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
