import { describe, expect, it } from 'vitest';
import { weeklyDigestEmail } from '@/lib/email/weekly-digest';
import type { OutgoingEmail } from '@/lib/email/mailer';
import { createWeeklyDigestHandler, type WeeklyDigestData } from '@/lib/notify/weekly';
import type { Job, JobContext } from '@/lib/jobs/types';

/** The Monday rep digest (2026-11-14). */

const REP = '11111111-1111-4111-8111-111111111111';
const TOM = '22222222-2222-4222-8222-222222222222';

const busy: WeeklyDigestData = {
  to: 'zaid@tma.example',
  enabled: true,
  repFirstName: 'Zaid',
  registered: 12,
  opened: 5,
  booked: 1,
  warm: [
    { sessionId: TOM, firstName: 'Tom', company: 'Hire Co', daysSinceOpened: 6 },
    { sessionId: REP, firstName: null, company: null, daysSinceOpened: 0 },
  ],
  warmTotal: 7,
  draftsReady: 2,
  questionsWaiting: 1,
};

const quiet: WeeklyDigestData = {
  ...busy,
  registered: 0,
  opened: 0,
  booked: 0,
  warm: [],
  warmTotal: 0,
  draftsReady: 0,
  questionsWaiting: 0,
};

function harness(data: WeeklyDigestData | null) {
  const sent: OutgoingEmail[] = [];
  const logs: { event: string; details: Record<string, unknown> }[] = [];
  const checkpoints = new Map<string, unknown>();

  const handler = createWeeklyDigestHandler({
    load: async () => data,
    send: async (email) => {
      sent.push(email);
      return 'sent';
    },
    appUrl: 'https://insignar.example',
    now: () => new Date('2026-11-16T08:00:00Z'),
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

describe('weeklyDigestEmail', () => {
  const email = weeklyDigestEmail({ ...busy, appUrl: 'https://insignar.example' });

  it('leads with what needs doing and last week’s numbers', () => {
    expect(email.subject).toBe('Your week: 7 people to follow up, 1 question waiting');
    expect(email.text).toContain('12 cards handed out · 5 opened · 1 meeting booked');
  });

  it('names each warm lead with a link to that contact, and counts the rest', () => {
    expect(email.text).toContain(
      'Tom at Hire Co, opened 6 days ago: https://insignar.example/sessions/' + TOM + '/edit',
    );
    expect(email.text).toContain('Someone, opened today');
    expect(email.text).toContain('…and 5 more on your dashboard.');
  });

  it('points drafts and questions at where they are handled, and says how to stop it', () => {
    expect(email.text).toContain('2 follow-up drafts are ready to check and send.');
    expect(email.text).toContain('https://insignar.example/settings#questions');
    expect(email.text).toContain('Turn it off in Setup.');
  });

  it('escapes names before they go into HTML', () => {
    const html = weeklyDigestEmail({
      ...busy,
      warm: [{ sessionId: TOM, firstName: '<b>x</b>', company: null, daysSinceOpened: 1 }],
      appUrl: 'https://insignar.example',
    }).html;
    expect(html).not.toContain('<b>x</b>');
  });

  it('uses the results as the subject when nothing is waiting', () => {
    const calm = weeklyDigestEmail({
      ...quiet,
      opened: 3,
      appUrl: 'https://insignar.example',
    });
    expect(calm.subject).toBe('Your week: 3 opened, 0 meetings booked');
  });
});

describe('the weekly_digest handler', () => {
  it('sends once per rep per week, keyed so a retry cannot send twice', async () => {
    const { handler, context, sent } = harness(busy);
    const ctx = context({ week_start: '2026-11-16' });
    await handler(ctx);
    await handler(ctx);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('zaid@tma.example');
    expect(sent[0]!.idempotencyKey).toBe(`weekly_digest:${REP}:2026-11-16`);
  });

  it.each([
    ['nothing_to_report', quiet],
    ['turned_off', { ...busy, enabled: false }],
    ['no_rep_email', { ...busy, to: null }],
    ['no_profile', null],
  ] as const)('sends nothing when %s', async (reason, data) => {
    const { handler, context, sent, logs } = harness(data);
    await handler(context({ week_start: '2026-11-16' }));
    expect(sent).toHaveLength(0);
    expect(logs[0]!.details.reason).toBe(reason);
  });

  it('refuses a malformed payload permanently rather than retrying it', async () => {
    const { handler, context } = harness(busy);
    await expect(handler(context({ week_start: 'monday' }))).rejects.toThrow(/bad payload/);
  });
});
