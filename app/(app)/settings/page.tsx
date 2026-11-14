import Link from 'next/link';
import { Check } from 'lucide-react';
import styles from '@/app/ui-slice.module.css';
import { publicProfileCheck } from '@/lib/domain/public-profile';
import { BackLink } from '@/components/back-link';
import { getBusinessProfile, getProfile } from '@/lib/db/rep';
import { requireRep } from '@/lib/db/server';
import { serviceClient } from '@/lib/db/service';
import { parseNiches } from '@/lib/db/rep';
import { pitchUsesMock } from '@/lib/ai/models';
import { PhotoUpload } from './photo-upload';
import { commonQuestions } from '@/lib/chat/knowledge';
import { suggestedAssistantQuestions } from '@/lib/chat/settings';
import { AssistantStudio } from '@/components/assistant-studio';
import {
  BusinessForm,
  KnowledgeForm,
  PitchVoiceForm,
  PlaybookForm,
  ProfileForm,
  UnansweredQuestions,
} from './settings-forms';

export const metadata = { title: 'Setup' };
export const dynamic = 'force-dynamic';

const QUESTION_COLUMNS =
  'id, question, handed_off, resolved_at, saved_answer, sessions(status, prospect_name, prospect_email, prospect_submitted_email, prospect_submitted_phone, cards(code))';

export default async function SettingsPage() {
  const rep = await requireRep();

  const [profile, business, knowledge, playbook, events, unanswered, savedAnswers] =
    await Promise.all([
      getProfile(rep.userId),
      getBusinessProfile(rep.userId),
      serviceClient()
        .from('knowledge_base')
        .select('topic, content, source')
        .eq('user_id', rep.userId),
      serviceClient()
        .from('playbook_entries')
        .select('id, problem, why, checks, resource_url')
        .eq('user_id', rep.userId)
        .order('created_at'),
      serviceClient().from('events').select('niches').eq('user_id', rep.userId),
      serviceClient()
        .from('chat_unanswered')
        .select(QUESTION_COLUMNS)
        .eq('user_id', rep.userId)
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(20),
      serviceClient()
        .from('chat_unanswered')
        .select(QUESTION_COLUMNS)
        .eq('user_id', rep.userId)
        .not('saved_answer', 'is', null)
        .not('resolved_at', 'is', null)
        .order('resolved_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(5),
    ]);

  const publicFields = publicProfileCheck(profile, business);
  const presentFields = publicFields.filter((field) => field.present).length;

  const have = new Set((playbook.data ?? []).map((e) => e.problem.trim().toLowerCase()));
  const suggestions = [
    ...new Set(
      (events.data ?? []).flatMap((e) => parseNiches(e.niches).flatMap((n) => n.problems)),
    ),
  ].filter((p) => !have.has(p.trim().toLowerCase()));

  const entries = Object.fromEntries(
    (knowledge.data ?? [])
      .filter((row) => row.source === 'manual')
      .map((row) => [row.topic, row.content]),
  );

  return (
    <div className={`${styles.surface} ${styles.repSurface} flex flex-col gap-5`}>
      <div>
        <BackLink href="/dashboard">Today</BackLink>
        <h1 className="font-display text-ink mt-3 text-2xl font-bold tracking-tight">Setup</h1>
      </div>
      <section
        className="border-line bg-surface shadow-card rounded-xl border p-4"
        aria-labelledby="photo-heading"
      >
        <h2 id="photo-heading" className="font-display text-ink mb-4 font-semibold">
          Your photo
        </h2>
        <PhotoUpload name={profile?.full_name ?? ''} photoUrl={profile?.photo_url ?? null} />
      </section>
      <BusinessForm business={business} />
      <div id="problems" className="scroll-mt-24">
        <PlaybookForm
          entries={playbook.data ?? []}
          suggestions={suggestions}
          draftEnabled={!pitchUsesMock()}
        />
      </div>
      <ProfileForm profile={profile} />
      <PitchVoiceForm profile={profile} />
      <section className={styles.profileCheck} aria-labelledby="public-profile-heading">
        <h2 id="public-profile-heading" className={styles.sectionLabel}>
          Public profile check
        </h2>
        <p className="mt-2 text-xl font-semibold">
          {presentFields} of {publicFields.length} details added
        </p>
        <p className="text-ink-3 mt-2 text-sm">Missing details are left out of your public page.</p>
        <ul className="mt-4">
          {publicFields.map((field) => (
            <li key={field.label} className={styles.profileCheckRow}>
              <span
                className={field.present ? styles.profilePresent : styles.profileMissing}
                aria-hidden="true"
              >
                {field.present ? <Check className="h-4 w-4" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{field.label}</p>
                <p className="text-ink-3 text-sm">{field.present ? 'Added' : 'Missing'}</p>
              </div>
              <Link
                href={field.href}
                aria-label={`${field.present ? 'Edit' : 'Add'} ${field.label}`}
              >
                {field.present ? 'Edit' : 'Add'}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.profileCheck} aria-labelledby="common-questions-heading">
        <h2 id="common-questions-heading" className={styles.sectionLabel}>
          Common questions
        </h2>
        <p className="text-ink-3 mt-2 text-sm">Add the basics your prospects need before a call.</p>
        <ul className="mt-4">
          {commonQuestions(knowledge.data ?? []).map((question) => (
            <li key={question.topic} className={styles.profileCheckRow}>
              <span
                className={question.covered ? styles.profilePresent : styles.profileMissing}
                aria-hidden="true"
              >
                {question.covered ? <Check className="h-4 w-4" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{question.label}</p>
                <p className="text-ink-3 text-sm">{question.covered ? 'Added' : 'Missing'}</p>
              </div>
              <Link
                href={`#kb-${question.topic}`}
                aria-label={`${question.covered ? 'Edit' : 'Add'} ${question.label}`}
              >
                {question.covered ? 'Edit' : 'Add'}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <UnansweredQuestions
        questions={[...(unanswered.data ?? []), ...(savedAnswers.data ?? [])]}
        loadError={Boolean(unanswered.error || savedAnswers.error)}
        repName={profile?.full_name ?? 'Your contact'}
      />
      <KnowledgeForm entries={entries} />
      <AssistantStudio
        blockedTopics={profile?.assistant_blocked_topics ?? []}
        suggestions={suggestedAssistantQuestions(
          [
            ...(playbook.data ?? []).map((entry) => entry.problem),
            ...(events.data ?? []).flatMap((event) =>
              parseNiches(event.niches).flatMap((niche) => niche.problems),
            ),
          ],
          knowledge.data ?? [],
        )}
      />
    </div>
  );
}
