import 'server-only';
import { serviceClient } from '@/lib/db/service';
import { sendEmail } from '@/lib/email/mailer';
import { env } from '@/lib/env';
import type { WeeklyDigestData, WeeklyDigestDeps } from './weekly';

const DAY = 24 * 60 * 60 * 1000;
/** A page opened longer ago than this has gone cold; the digest stops naming it. */
const WARM_DAYS = 14;
const WARM_SHOWN = 5;
/** Matches queue_weekly_digests(): older contacts are out of the pilot's working set. */
const ACTIVE_DAYS = 56;
const since = (value: string | null, iso: string) =>
  value !== null && Date.parse(value) >= Date.parse(iso);

/** Production wiring for the weekly_digest handler: Supabase and Resend. */
export function productionWeeklyDigestDeps(): WeeklyDigestDeps {
  const db = serviceClient();

  return {
    async load(userId, now): Promise<WeeklyDigestData | null> {
      const weekAgo = new Date(now.getTime() - 7 * DAY).toISOString();
      const warmSince = new Date(now.getTime() - WARM_DAYS * DAY).toISOString();
      const activeSince = new Date(now.getTime() - ACTIVE_DAYS * DAY).toISOString();

      const [{ data: profile }, { data: user }, { data: sessions }, { count: questions }] =
        await Promise.all([
          db.from('profiles').select('full_name, weekly_digest').eq('id', userId).maybeSingle(),
          // The rep's own sign-in address: the digest is private to them.
          db.auth.admin.getUserById(userId),
          db
            .from('sessions')
            .select(
              'id, prospect_name, prospect_company, registered_at, first_viewed_at, followup_sent_at, followup_outcome',
            )
            .eq('user_id', userId)
            .eq('status', 'active')
            .or(`registered_at.gte.${activeSince},first_viewed_at.gte.${warmSince}`),
          db
            .from('chat_unanswered')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .is('resolved_at', null),
        ]);
      if (!profile) return null;

      const rows = sessions ?? [];
      const ids = rows.map((s) => s.id);
      const [{ data: bookings }, { data: drafts }] = ids.length
        ? await Promise.all([
            db
              .from('bookings')
              .select('session_id, created_at')
              .in('session_id', ids)
              .eq('status', 'confirmed'),
            db
              .from('followup_drafts')
              .select('session_id')
              .in('session_id', ids)
              .is('sent_at', null),
          ])
        : [{ data: [] }, { data: [] }];

      const booked = new Set((bookings ?? []).map((b) => b.session_id));
      const warm = rows
        .filter(
          (s) => since(s.first_viewed_at, warmSince) && !booked.has(s.id) && !s.followup_outcome,
        )
        .sort((a, b) => Date.parse(a.first_viewed_at!) - Date.parse(b.first_viewed_at!))
        .map((s) => ({
          sessionId: s.id,
          firstName: s.prospect_name?.trim().split(/\s+/)[0] || null,
          company: s.prospect_company?.trim() || null,
          daysSinceOpened: Math.floor((now.getTime() - Date.parse(s.first_viewed_at!)) / DAY),
        }));
      const unsent = new Set(
        rows.filter((s) => !s.followup_sent_at && !s.followup_outcome).map((s) => s.id),
      );
      const fullName = profile.full_name?.trim() || 'there';

      return {
        to: user?.user?.email ?? null,
        enabled: profile.weekly_digest,
        repFirstName: fullName.split(/\s+/)[0] ?? fullName,
        registered: rows.filter((s) => since(s.registered_at, weekAgo)).length,
        opened: rows.filter((s) => since(s.first_viewed_at, weekAgo)).length,
        booked: (bookings ?? []).filter((b) => since(b.created_at, weekAgo)).length,
        warm: warm.slice(0, WARM_SHOWN),
        warmTotal: warm.length,
        draftsReady: new Set((drafts ?? []).map((d) => d.session_id).filter((id) => unsent.has(id)))
          .size,
        questionsWaiting: questions ?? 0,
      };
    },
    send: sendEmail,
    appUrl: env.NEXT_PUBLIC_APP_URL,
    now: () => new Date(),
    log(event, details) {
      console.log(JSON.stringify({ event, ...details }));
    },
  };
}
