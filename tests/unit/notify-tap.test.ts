import { describe, expect, it } from 'vitest';
import { tapAlertEmail } from '@/lib/email/tap-alert';
import type { OutgoingEmail } from '@/lib/email/mailer';
import { createNotifyTapHandler, type TapAlertData } from '@/lib/notify/tap';
import type { Job, JobContext } from '@/lib/jobs/types';

/**
 * The tap alert (Phase 5): "Tom just opened your card".
 */

const SESSION = '11111111-1111-4111-8111-111111111111';

const tom: TapAlertData = {
  status: 'active',
  to: 'zaid@tma.example',
  repFirstName: 'Zaid',
  prospectName: 'Tom Hargreaves',
  prospectCompany: 'BuildRite Plant',
  problem: 'Idle machine tracking',
  eventName: 'Plant Hire Expo',
};

function harness(data: TapAlertData | null) {
  const sent: OutgoingEmail[] = [];
  const logs: { event: string; details: Record<string, unknown> }[] = [];
  const checkpoints = new Map<string, unknown>();

  const handler = createNotifyTapHandler({
    load: async () => data,
    send: async (email) => {
      sent.push(email);
      return 'sent';
    },
    appUrl: 'https://taplead.app',
    log: (event, details) => logs.push({ event, details }),
  });

  // A minimal JobContext with real checkpoint semantics: a saved step is not re-run.
  const context = (jobSessionId: string | null = SESSION): JobContext =>
    ({
      job: { id: 'job-1', session_id: jobSessionId } as Job,
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

describe('the notify_tap handler', () => {
  it('emails the rep once, with an idempotency key tied to the session', async () => {
    const { handler, context, sent } = harness(tom);
    await handler(context());

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('zaid@tma.example');
    expect(sent[0]!.subject).toBe('Tom just opened your card');
    expect(sent[0]!.idempotencyKey).toBe(`notify_tap:${SESSION}`);
    expect(sent[0]!.text).toContain(`https://taplead.app/sessions/${SESSION}/edit`);
  });

  it('does not send again when a retry resumes after the send was checkpointed', async () => {
    const { handler, context, sent } = harness(tom);
    const ctx = context();
    await handler(ctx);
    await handler(ctx);
    expect(sent).toHaveLength(1);
  });

  it('sends nothing for a session voided since the tap', async () => {
    const { handler, context, sent, logs } = harness({ ...tom, status: 'voided' });
    await handler(context());
    expect(sent).toEqual([]);
    expect(logs[0]).toMatchObject({ event: 'tap_alert_skipped', details: { reason: 'voided' } });
  });

  it('sends nothing, and does not fail, when the rep has no email address', async () => {
    const { handler, context, sent } = harness({ ...tom, to: null });
    await handler(context());
    expect(sent).toEqual([]);
  });

  it('fails permanently for a job with no session', async () => {
    const { handler, context } = harness(tom);
    await expect(handler(context(null))).rejects.toThrow(/no session/);
  });
});

describe('tapAlertEmail', () => {
  const email = tapAlertEmail({
    repFirstName: 'Zaid',
    prospectName: 'Tom Hargreaves',
    prospectCompany: 'BuildRite Plant',
    problem: 'Idle machine tracking',
    eventName: 'Plant Hire Expo',
    sessionUrl: 'https://taplead.app/sessions/x/edit',
  });

  it('says who, where from and what about', () => {
    expect(email.subject).toBe('Tom just opened your card');
    expect(email.text).toContain(
      'Tom Hargreaves · BuildRite Plant · talked about idle machine tracking · at Plant Hire Expo',
    );
  });

  it('tells the rep not to mention that they saw the page opened (§19.3)', () => {
    expect(email.text).toMatch(/Don’t mention that you saw them open the page/);
    expect(email.html).toMatch(/Don’t mention that you saw them open the page/);
  });

  it('escapes HTML typed into prospect details', () => {
    const risky = tapAlertEmail({
      repFirstName: 'Zaid',
      prospectName: '<img src=x onerror=alert(1)>',
      prospectCompany: null,
      problem: null,
      eventName: null,
      sessionUrl: 'https://taplead.app/sessions/x/edit',
    });
    expect(risky.html).not.toContain('<img');
    expect(risky.html).toContain('&lt;img');
  });

  it('still reads naturally with no details at all', () => {
    const bare = tapAlertEmail({
      repFirstName: 'Zaid',
      prospectName: null,
      prospectCompany: null,
      problem: null,
      eventName: null,
      sessionUrl: 'https://taplead.app/sessions/x/edit',
    });
    expect(bare.subject).toBe('Your prospect just opened your card');
    expect(bare.text).not.toContain('()');
  });
});
