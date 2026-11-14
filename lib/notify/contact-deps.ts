import 'server-only';
import { serviceClient } from '@/lib/db/service';
import { parseContactFormAnswers } from '@/lib/domain/contact-form';
import { sendEmail } from '@/lib/email/mailer';
import { env } from '@/lib/env';
import type { NotifyContactDeps } from './contact';

export function productionNotifyContactDeps(): NotifyContactDeps {
  const db = serviceClient();
  return {
    async load(sessionId) {
      const { data: session, error } = await db
        .from('sessions')
        .select(
          'status, user_id, prospect_name, prospect_submitted_email, prospect_submitted_phone, prospect_form_answers, prospect_consent_at',
        )
        .eq('id', sessionId)
        .maybeSingle();
      if (error) throw new Error(`contact alert session load failed: ${error.code}`);
      if (!session) return null;

      const [{ data: profile, error: profileError }, { data: user, error: userError }] =
        await Promise.all([
          db.from('profiles').select('full_name').eq('id', session.user_id).maybeSingle(),
          db.auth.admin.getUserById(session.user_id),
        ]);
      if (profileError || userError) throw new Error('contact alert rep load failed');
      const answers = parseContactFormAnswers(session.prospect_form_answers);
      const fullName = profile?.full_name?.trim() || 'there';
      return {
        status: session.status,
        to: user?.user?.email ?? null,
        repFirstName: fullName.split(/\s+/)[0] ?? fullName,
        prospectName:
          answers.find((answer) => answer.label === 'Name')?.value || session.prospect_name,
        email: session.prospect_submitted_email,
        phone: session.prospect_submitted_phone,
        answers,
        consentAt: session.prospect_consent_at,
      };
    },
    send: sendEmail,
    appUrl: env.NEXT_PUBLIC_APP_URL,
    log(event, details) {
      console.log(JSON.stringify({ event, ...details }));
    },
  };
}
