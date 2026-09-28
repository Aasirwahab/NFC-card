import { PermanentJobError, type JobHandler } from '@/lib/jobs/types';
import { composeFollowupDraft, followupChannel } from './draft';

/**
 * The `followup` job: write the no-tap draft for one session (spec §19.3).
 * Enqueued by queue_no_tap_followups from the minute cron. All I/O injected.
 */

export type FollowupData = {
  status: string;
  firstViewedAt: string | null;
  prospectName: string | null;
  linkedinUrl: string | null;
  prospectEmail: string | null;
  problem: string | null;
  eventName: string | null;
  repFullName: string;
  businessName: string | null;
};

export type FollowupDeps = {
  load(sessionId: string): Promise<FollowupData | null>;
  save(sessionId: string, channel: string, text: string): Promise<boolean>;
  log(event: string, details: Record<string, unknown>): void;
};

export function createFollowupHandler(deps: FollowupDeps): JobHandler {
  return async (context) => {
    const sessionId = context.job.session_id;
    if (!sessionId) throw new PermanentJobError('followup job has no session');

    const data = await deps.load(sessionId);
    // Voided, deleted, or opened since it was queued: nothing to follow up.
    if (!data || data.status !== 'active' || data.firstViewedAt) {
      deps.log('followup_skipped', { sessionId, reason: data ? 'opened_or_inactive' : 'missing' });
      return;
    }

    const channel = followupChannel({
      linkedin_url: data.linkedinUrl,
      prospect_email: data.prospectEmail,
    });
    const text = composeFollowupDraft({
      channel,
      prospectName: data.prospectName,
      repFullName: data.repFullName,
      eventName: data.eventName,
      problem: data.problem,
      businessName: data.businessName,
    });

    const saved = await context.step('save', 10_000, () => deps.save(sessionId, channel, text));
    deps.log('followup_drafted', { sessionId, channel, saved });
  };
}
