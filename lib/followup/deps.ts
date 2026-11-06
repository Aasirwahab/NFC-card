import 'server-only';
import { serviceClient } from '@/lib/db/service';
import type { FollowupData, FollowupDeps } from './handler';

/** Production wiring for the followup handler. */
export function productionFollowupDeps(): FollowupDeps {
  const db = serviceClient();
  return {
    async load(sessionId): Promise<FollowupData | null> {
      const { data: s } = await db
        .from('sessions')
        .select(
          'status, first_viewed_at, followup_sent_at, followup_outcome, user_id, prospect_name, linkedin_url, prospect_email, problems',
        )
        .eq('id', sessionId)
        .maybeSingle();
      if (!s) return null;

      const [{ data: profile }, { data: business }] = await Promise.all([
        db.from('profiles').select('full_name').eq('id', s.user_id).maybeSingle(),
        db.from('business_profiles').select('company_name').eq('user_id', s.user_id).maybeSingle(),
      ]);

      return {
        status: s.status,
        firstViewedAt: s.first_viewed_at,
        followupClosed: Boolean(s.followup_sent_at || s.followup_outcome),
        prospectName: s.prospect_name,
        linkedinUrl: s.linkedin_url,
        prospectEmail: s.prospect_email,
        // Only a problem the rep ticked: never their free text.
        problem: s.problems.find((p) => p.trim().length > 0) ?? null,
        repFullName: profile?.full_name?.trim() || 'the team',
        businessName: business?.company_name ?? null,
      };
    },
    async save(sessionId, channel, text) {
      const { data, error } = await db.rpc('save_followup_draft', {
        p_session_id: sessionId,
        p_channel: channel,
        p_text: text,
      });
      if (error) throw new Error(`save_followup_draft failed: ${error.message}`);
      return Boolean(data);
    },
    log(event, details) {
      console.log(JSON.stringify({ event, ...details }));
    },
  };
}
