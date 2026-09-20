import { getBusinessProfile, getProfile } from '@/lib/db/rep';
import { requireRep } from '@/lib/db/server';
import { serviceClient } from '@/lib/db/service';
import { BusinessForm, KnowledgeForm, ProfileForm } from './settings-forms';

export const metadata = { title: 'Setup' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const rep = await requireRep();

  const [profile, business, knowledge] = await Promise.all([
    getProfile(rep.userId),
    getBusinessProfile(rep.userId),
    serviceClient()
      .from('knowledge_base')
      .select('topic, content')
      .eq('user_id', rep.userId)
      .eq('source', 'manual'),
  ]);

  const entries = Object.fromEntries((knowledge.data ?? []).map((row) => [row.topic, row.content]));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-ink text-2xl font-bold tracking-tight">Setup</h1>
      <ProfileForm profile={profile} />
      <BusinessForm business={business} />
      <KnowledgeForm entries={entries} />
    </div>
  );
}
