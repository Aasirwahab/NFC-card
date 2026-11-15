import { contactAlertEmail, type ContactAlertInput } from '@/lib/email/contact-alert';
import type { Mailer } from '@/lib/email/mailer';
import { PermanentJobError, type JobHandler } from '@/lib/jobs/types';

export type ContactAlertData = Omit<ContactAlertInput, 'sessionUrl'> & {
  status: string;
  to: string | null;
  consentAt: string | null;
};

export type NotifyContactDeps = {
  load(sessionId: string): Promise<ContactAlertData | null>;
  send: Mailer;
  appUrl: string;
  /** When this session's last contact alert was sent, or null if none was. */
  lastAlertAt(sessionId: string): Promise<string | null>;
  recordAlert(sessionId: string): Promise<void>;
  now?: () => number;
  log(event: string, details: Record<string, unknown>): void;
};

/** One alert per session per window: repeated saves must not spam the rep. */
export const CONTACT_ALERT_WINDOW_MS = 10 * 60_000;

export function createNotifyContactHandler(deps: NotifyContactDeps): JobHandler {
  return async (context) => {
    const sessionId = context.job.session_id;
    if (!sessionId) throw new PermanentJobError('notify_contact job has no session');

    // Several saves may share one live job, so read the latest contact at send time.
    const data = await deps.load(sessionId);
    if (!data || data.status !== 'active') {
      deps.log('contact_alert_skipped', { sessionId, reason: data ? data.status : 'missing' });
      return;
    }
    if (!data.to || !data.consentAt || (!data.email && !data.phone)) {
      deps.log('contact_alert_skipped', {
        sessionId,
        reason: !data.to ? 'no_rep_email' : 'no_contact',
      });
      return;
    }

    const lastAlert = await deps.lastAlertAt(sessionId);
    const now = (deps.now ?? Date.now)();
    if (lastAlert && now - new Date(lastAlert).getTime() < CONTACT_ALERT_WINDOW_MS) {
      deps.log('contact_alert_skipped', { sessionId, reason: 'recent_alert' });
      return;
    }

    const email = contactAlertEmail({
      ...data,
      sessionUrl: new URL(`/sessions/${sessionId}/edit`, deps.appUrl).toString(),
    });
    const result = await context.step('send', 15_000, () =>
      deps.send({
        to: data.to!,
        ...email,
        idempotencyKey: `notify_contact:${sessionId}:${data.consentAt}`,
      }),
    );
    await context.step('record', 5_000, async () => {
      await deps.recordAlert(sessionId);
      return null;
    });
    deps.log('contact_alert', { sessionId, result });
  };
}
