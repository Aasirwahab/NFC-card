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
import { commonQuestions } from '@/lib/chat/knowledge';
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

export default async function SettingsPage() {
  const rep = await requireRep();

  const [profile, business, knowledge, playbook, events, unanswered] = await Promise.all([
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
      .select('id, question')
      .eq('user_id', rep.userId)
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(20),
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
                <p className="text-ink-3 text-sm">{field.present ? 'Present' : 'Missing'}</p>
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
      <ProfileForm profile={profile} />
      <PitchVoiceForm profile={profile} />
      <BusinessForm business={business} />
      <PlaybookForm
        entries={playbook.data ?? []}
        suggestions={suggestions}
        draftEnabled={!pitchUsesMock()}
      />
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
        questions={unanswered.data ?? []}
        loadError={Boolean(unanswered.error)}
      />
      <KnowledgeForm entries={entries} />
    </div>
  );
}
