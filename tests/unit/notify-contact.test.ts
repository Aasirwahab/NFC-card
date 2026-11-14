import { describe, expect, it } from 'vitest';
import { contactAlertEmail } from '@/lib/email/contact-alert';
import type { OutgoingEmail } from '@/lib/email/mailer';
import { createNotifyContactHandler, type ContactAlertData } from '@/lib/notify/contact';
import type { Job, JobContext } from '@/lib/jobs/types';

/**
 * The contact alert: "Tom shared their details".
 */

const SESSION = '11111111-1111-4111-8111-111111111111';

const tom: ContactAlertData = {
  status: 'active',
  to: 'zaid@tma.example',
  repFirstName: 'Zaid',
  prospectName: 'Tom Hargreaves',
  email: 'tom@example.com',
  phone: null,
  answers: [{ label: 'Name', value: 'Tom Hargreaves' }],
  consentAt: '2026-11-14T12:00:00.000Z',
};

function harness(data: ContactAlertData | null) {
  const sent: OutgoingEmail[] = [];
  const logs: { event: string; details: Record<string, unknown> }[] = [];
  const checkpoints = new Map<string, unknown>();

  const handler = createNotifyContactHandler({
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

describe('the notify_contact handler', () => {
  it('emails the rep once, with an idempotency key tied to the session', async () => {
    const { handler, context, sent } = harness(tom);
    await handler(context());

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('zaid@tma.example');
    expect(sent[0]!.subject).toBe('Tom shared their details');
    expect(sent[0]!.idempotencyKey).toBe(`notify_contact:${SESSION}:${tom.consentAt}`);
    expect(sent[0]!.text).toContain(`https://taplead.app/sessions/${SESSION}/edit`);
  });

  it('does not send again when a retry resumes after the send was checkpointed', async () => {
    const { handler, context, sent } = harness(tom);
    const ctx = context();
    await handler(ctx);
    await handler(ctx);
    expect(sent).toHaveLength(1);
  });

  it('sends nothing for a session voided since details were shared', async () => {
    const { handler, context, sent, logs } = harness({ ...tom, status: 'voided' });
    await handler(context());
    expect(sent).toEqual([]);
    expect(logs[0]).toMatchObject({
      event: 'contact_alert_skipped',
      details: { reason: 'voided' },
    });
  });

  it('sends nothing, and does not fail, when the rep has no email address', async () => {
    const { handler, context, sent } = harness({ ...tom, to: null });
    await handler(context());
    expect(sent).toEqual([]);
  });

  it('uses the latest contact and consent timestamp when the job runs', async () => {
    const data = { ...tom };
    const { handler, context, sent } = harness(data);
    data.email = 'latest@example.com';
    data.consentAt = '2026-11-14T13:00:00.000Z';
    await handler(context());
    expect(sent[0]!.text).toContain('latest@example.com');
    expect(sent[0]!.idempotencyKey).toBe(`notify_contact:${SESSION}:${data.consentAt}`);
  });
  it.each([null, { ...tom, consentAt: null }, { ...tom, email: null, phone: null }])(
    'skips a missing or unconsented contact',
    async (data) => {
      const { handler, context, sent } = harness(data);
      await handler(context());
      expect(sent).toEqual([]);
    },
  );
  it('fails permanently for a job with no session', async () => {
    const { handler, context } = harness(tom);
    await expect(handler(context(null))).rejects.toThrow(/no session/);
  });
});

describe('contactAlertEmail', () => {
  const input = {
    repFirstName: 'Zaid',
    prospectName: 'Tom Hargreaves',
    email: 'tom@example.com',
    phone: '+447700900123',
    answers: [
      { label: 'Name', value: 'Tom Hargreaves' },
      { label: 'Best time?', value: 'Morning' },
    ],
    sessionUrl: 'https://taplead.app/sessions/x/edit',
  };
  it('includes full shared contact, snapshot answers and a session link', () => {
    const email = contactAlertEmail(input);
    expect(email.subject).toBe('Tom shared their details');
    for (const value of [
      'tom@example.com',
      '+447700900123',
      'Name: Tom Hargreaves',
      'Best time? Morning',
      input.sessionUrl,
    ]) {
      expect(email.text).toContain(value);
      expect(email.html).toContain(value);
    }
  });
  it('escapes every HTML value including labels and contact', () => {
    const email = contactAlertEmail({
      ...input,
      repFirstName: '<rep>',
      prospectName: '<img src=x>',
      email: '<email>',
      phone: '<phone>',
      answers: [{ label: '<label>', value: '<script>"&' }],
      sessionUrl: 'https://example.com/"',
    });
    for (const value of ['<rep>', '<img', '<email>', '<phone>', '<label>', '<script>'])
      expect(email.html).not.toContain(value);
    expect(email.html).toContain('&lt;script&gt;&quot;&amp;');
    expect(email.html).toContain('href="https://example.com/&quot;"');
  });
  it('uses Someone without a name', () => {
    expect(contactAlertEmail({ ...input, prospectName: ' ' }).subject).toBe(
      'Someone shared their details',
    );
  });
});
