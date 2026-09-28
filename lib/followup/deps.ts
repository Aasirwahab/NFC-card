import 'server-only';
import { serviceClient } from '@/lib/db/service';
import { primaryProblem } from '@/lib/domain/pitch';
import type { FollowupData, FollowupDeps } from './handler';

/** Production wiring for the followup handler. */
export function productionFollowupDeps(): FollowupDeps {
  const db = serviceClient();
  return {
    async load(sessionId): Promise<FollowupData | null> {
      const { data: s } = await db
        .from('sessions')
        .select(
          'status, first_viewed_at, user_id, event_id, prospect_name, linkedin_url, prospect_email, problems, custom_problems',
        )
        .eq('id', sessionId)
        .maybeSingle();
      if (!s) return null;

      const [{ data: profile }, { data: business }, { data: event }] = await Promise.all([
        db.from('profiles').select('full_name').eq('id', s.user_id).maybeSingle(),
        db.from('business_profiles').select('company_name').eq('user_id', s.user_id).maybeSingle(),
        db.from('events').select('name').eq('id', s.event_id).maybeSingle(),
      ]);

      return {
        status: s.status,
        firstViewedAt: s.first_viewed_at,
        prospectName: s.prospect_name,
        linkedinUrl: s.linkedin_url,
        prospectEmail: s.prospect_email,
        problem: primaryProblem({ problems: s.problems, customProblems: s.custom_problems }),
        eventName: event?.name ?? null,
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
