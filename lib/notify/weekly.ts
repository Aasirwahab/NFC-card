import {
  weeklyDigestEmail,
  weeklyDigestIsEmpty,
  type WeeklyDigestInput,
} from '@/lib/email/weekly-digest';
import type { Mailer } from '@/lib/email/mailer';
import { PermanentJobError, type JobHandler } from '@/lib/jobs/types';

/**
 * The `weekly_digest` job: the Monday rep email (2026-11-14).
 *
 * Enqueued by queue_weekly_digests() from the minute cron, once per rep per
 * week. All I/O is injected, like event_digest.
 */

export type WeeklyDigestData = Omit<WeeklyDigestInput, 'appUrl'> & {
  /** The rep's own sign-in address. Null when the account has none. */
  to: string | null;
  /** Re-checked at send time: the rep may have turned it off after it was queued. */
  enabled: boolean;
};

export type WeeklyDigestDeps = {
  load(userId: string, now: Date): Promise<WeeklyDigestData | null>;
  send: Mailer;
  appUrl: string;
  now(): Date;
  log(event: string, details: Record<string, unknown>): void;
};

export function createWeeklyDigestHandler(deps: WeeklyDigestDeps): JobHandler {
  return async (context) => {
    const payload = context.job.payload as { week_start?: unknown } | null;
    const weekStart =
      typeof payload?.week_start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.week_start)
        ? payload.week_start
        : null;
    if (!weekStart) throw new PermanentJobError('weekly_digest job has a bad payload');

    const userId = context.job.user_id;
    const data = await deps.load(userId, deps.now());
    const skip = (reason: string) => deps.log('weekly_digest_skipped', { weekStart, reason });

    if (!data) return skip('no_profile');
    if (!data.enabled) return skip('turned_off');
    if (!data.to) return skip('no_rep_email');
    if (weeklyDigestIsEmpty(data)) return skip('nothing_to_report');

    const { to, enabled: _, ...input } = data; // eslint-disable-line @typescript-eslint/no-unused-vars
    const email = weeklyDigestEmail({ ...input, appUrl: deps.appUrl });

    const result = await context.step('send', 15_000, () =>
      deps.send({ to, ...email, idempotencyKey: `weekly_digest:${userId}:${weekStart}` }),
    );

    deps.log('weekly_digest', { weekStart, result, warm: data.warmTotal });
  };
}
