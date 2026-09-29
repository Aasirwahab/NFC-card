import { getBusinessProfile, getProfile } from '@/lib/db/rep';
import { requireRep } from '@/lib/db/server';
import { serviceClient } from '@/lib/db/service';
import { parseNiches } from '@/lib/db/rep';
import { pitchUsesMock } from '@/lib/ai/models';
import { BusinessForm, KnowledgeForm, PlaybookForm, ProfileForm } from './settings-forms';

export const metadata = { title: 'Setup' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const rep = await requireRep();

  const [profile, business, knowledge, playbook, events] = await Promise.all([
    getProfile(rep.userId),
    getBusinessProfile(rep.userId),
    serviceClient()
      .from('knowledge_base')
      .select('topic, content')
      .eq('user_id', rep.userId)
      .eq('source', 'manual'),
    serviceClient()
      .from('playbook_entries')
      .select('id, problem, why, checks, resource_url')
      .eq('user_id', rep.userId)
      .order('created_at'),
    serviceClient().from('events').select('niches').eq('user_id', rep.userId),
  ]);

  const have = new Set((playbook.data ?? []).map((e) => e.problem.trim().toLowerCase()));
  const suggestions = [
    ...new Set(
      (events.data ?? []).flatMap((e) => parseNiches(e.niches).flatMap((n) => n.problems)),
    ),
  ].filter((p) => !have.has(p.trim().toLowerCase()));

  const entries = Object.fromEntries((knowledge.data ?? []).map((row) => [row.topic, row.content]));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-ink text-2xl font-bold tracking-tight">Setup</h1>
      <ProfileForm profile={profile} />
      <BusinessForm business={business} />
      <PlaybookForm
        entries={playbook.data ?? []}
        suggestions={suggestions}
        draftEnabled={!pitchUsesMock()}
      />
      <KnowledgeForm entries={entries} />
    </div>
  );
}
