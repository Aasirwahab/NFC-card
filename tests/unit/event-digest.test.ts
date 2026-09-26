import { describe, expect, it } from 'vitest';
import { eventDigestEmail } from '@/lib/email/event-digest';
import type { OutgoingEmail } from '@/lib/email/mailer';
import { createEventDigestHandler, type EventDigestData } from '@/lib/notify/digest';
import type { Job, JobContext } from '@/lib/jobs/types';
import { eventSchema } from '@/lib/schemas/sessions';

/**
 * The morning-after event email (2026-09-25 review).
 */

const EVENT = '33333333-3333-4333-8333-333333333333';
const REP = '11111111-1111-4111-8111-111111111111';

const expo: EventDigestData = {
  to: 'zaid@tma.example',
  repFirstName: 'Zaid',
  eventName: 'Plant Hire Expo',
  handedOut: 15,
  opened: 4,
  booked: 2,
  needsDetails: [
    { sequence: 3, colour: 'Blue', firstName: 'Tom' },
    { sequence: 7, colour: 'Green', firstName: null },
  ],
  noChannel: 1,
};

function harness(data: EventDigestData | null) {
  const sent: OutgoingEmail[] = [];
  const logs: { event: string; details: Record<string, unknown> }[] = [];
  const checkpoints = new Map<string, unknown>();

  const handler = createEventDigestHandler({
    load: async () => data,
    send: async (email) => {
      sent.push(email);
      return 'sent';
    },
    appUrl: 'https://taplead.app',
    log: (event, details) => logs.push({ event, details }),
  });

  const context = (payload: unknown): JobContext =>
    ({
      job: { id: 'job-1', session_id: null, user_id: REP, payload } as unknown as Job,
      step: async (name: string, _estimate: number, fn: () => Promise<unknown>) => {
        if (checkpoints.has(name)) return checkpoints.get(name);
        const output = await fn();
        checkpoints.set(name, output);
        return output;
      },
      defer: () => {
        throw new Error('not used');
      },
    }) as unknown as JobContext;

  return { handler, context, sent, logs };
}

describe('eventDigestEmail', () => {
  it('leads with the results and lists every card that still needs details', () => {
    const email = eventDigestEmail({
      ...expo,
      round: 1,
      dashboardUrl: 'https://taplead.app/dashboard',
    });

    expect(email.subject).toBe('Plant Hire Expo: 4 opened, 2 cards need details');
    expect(email.text).toContain('15 cards registered · 4 opened · 2 meetings booked');
    expect(email.text).toContain('Card 3 (Blue) — Tom');
    expect(email.text).toContain('Card 7 (Green)');
    expect(email.text).toContain('1 person has no email or LinkedIn saved');
    // Pre-activated cards that never left the rep's hand also show as "needs details".
    expect(email.text).toContain('release it for your next event');
    expect(email.text).toContain('https://taplead.app/dashboard');
  });

  it('escapes what the rep typed before it goes into HTML', () => {
    const email = eventDigestEmail({
      ...expo,
      round: 1,
      eventName: '<script>x</script>',
      dashboardUrl: 'https://taplead.app/dashboard',
    });
    expect(email.html).not.toContain('<script>');
  });
});

describe('the event_digest handler', () => {
  it('sends round 1 once, keyed to the event and round', async () => {
    const { handler, context, sent } = harness(expo);
    const ctx = context({ event_id: EVENT, round: 1 });
    await handler(ctx);
    await handler(ctx); // a retry resumes from the checkpoint

    expect(sent).toHaveLength(1);
    expect(sent[0]!.idempotencyKey).toBe(`event_digest:${EVENT}:1`);
  });

  it('skips the 48-hour nudge when nothing is missing any more', async () => {
    const { handler, context, sent, logs } = harness({ ...expo, needsDetails: [] });
    await handler(context({ event_id: EVENT, round: 2 }));

    expect(sent).toHaveLength(0);
    expect(logs[0]!.details.reason).toBe('nothing_missing');
  });

  it('still sends round 1 when every card has details — it carries the results', async () => {
    const { handler, context, sent } = harness({ ...expo, needsDetails: [] });
    await handler(context({ event_id: EVENT, round: 1 }));
    expect(sent[0]!.subject).toBe('Plant Hire Expo: 4 of 15 opened so far');
  });

  it('refuses a malformed payload permanently rather than retrying it', async () => {
    const { handler, context } = harness(expo);
    await expect(handler(context({ round: 1 }))).rejects.toThrow(/bad payload/);
  });
});

describe('an event always has a date', () => {
  // The digest is timed from the event date. Without one it fell back to the day
  // of the first registration, which for cards activated the evening before is
  // the day BEFORE the event: round 1 went out on the morning of the event.
  it('refuses an event without a date', () => {
    expect(eventSchema.safeParse({ name: 'Plant Hire Expo' }).success).toBe(false);
    expect(eventSchema.safeParse({ name: 'Plant Hire Expo', event_date: '' }).success).toBe(false);
  });

  it('accepts an event with a date', () => {
    expect(
      eventSchema.safeParse({ name: 'Plant Hire Expo', event_date: '2026-10-05' }).success,
    ).toBe(true);
  });
});
