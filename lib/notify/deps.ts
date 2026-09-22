import 'server-only';
import { serviceClient } from '@/lib/db/service';
import { primaryProblem } from '@/lib/domain/pitch';
import { sendEmail } from '@/lib/email/mailer';
import { env } from '@/lib/env';
import type { NotifyTapDeps, TapAlertData } from './tap';

/** Production wiring for the notify_tap handler: Supabase and Resend. */
export function productionNotifyTapDeps(): NotifyTapDeps {
  const db = serviceClient();

  return {
    async load(sessionId): Promise<TapAlertData | null> {
      const { data: session } = await db
        .from('sessions')
        .select(
          'status, user_id, event_id, prospect_name, prospect_company, problems, custom_problems',
        )
        .eq('id', sessionId)
        .maybeSingle();
      if (!session) return null;

      const [{ data: profile }, { data: event }, { data: user }] = await Promise.all([
        db.from('profiles').select('full_name').eq('id', session.user_id).maybeSingle(),
        db.from('events').select('name').eq('id', session.event_id).maybeSingle(),
        // The rep's own sign-in address: the alert is private to them.
        db.auth.admin.getUserById(session.user_id),
      ]);

      const fullName = profile?.full_name?.trim() || 'there';

      return {
        status: session.status,
        to: user?.user?.email ?? null,
        repFirstName: fullName.split(/\s+/)[0] ?? fullName,
        prospectName: session.prospect_name,
        prospectCompany: session.prospect_company,
        problem: primaryProblem({
          problems: session.problems,
          customProblems: session.custom_problems,
        }),
        eventName: event?.name ?? null,
      };
    },
    send: sendEmail,
    appUrl: env.NEXT_PUBLIC_APP_URL,
    log(event, details) {
      console.log(JSON.stringify({ event, ...details }));
    },
  };
}
