import 'server-only';
import { Resend } from 'resend';
import { env } from '@/lib/env';

/**
 * Transactional email (spec §19.2), through Resend.
 *
 * With no RESEND_API_KEY the send is logged and skipped, not failed: local
 * development, CI and a production deploy before the account exists all keep
 * working, exactly as the pipeline does on the mock model. The env schema refuses
 * a key without EMAIL_FROM, so a configured deploy cannot send from nowhere.
 */

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /**
   * Resend drops a second send with the same key for 24 hours. A job retried
   * after the send succeeded, but before it was checkpointed, cannot email twice.
   */
  idempotencyKey: string;
};

export type SendResult = 'sent' | 'skipped';

export type Mailer = (email: OutgoingEmail) => Promise<SendResult>;

let client: Resend | null = null;

export const sendEmail: Mailer = async (email) => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.warn(
      JSON.stringify({
        event: 'email_skipped',
        reason: 'RESEND_API_KEY not set',
        subject: email.subject,
      }),
    );
    return 'skipped';
  }

  client ??= new Resend(env.RESEND_API_KEY);

  const { error } = await client.emails.send(
    {
      from: env.EMAIL_FROM,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    },
    { idempotencyKey: email.idempotencyKey },
  );

  if (error) throw new Error(`resend: ${error.name}: ${error.message}`);
  return 'sent';
};
