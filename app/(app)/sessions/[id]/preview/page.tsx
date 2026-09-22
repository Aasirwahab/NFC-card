import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProspectView } from '@/app/c/[code]/prospect-view';
import { previewForRep, shownPitch } from '@/lib/db/landing';
import { requireRep } from '@/lib/db/server';
import { serviceClient } from '@/lib/db/service';
import { PitchTools } from './pitch-tools';

export const metadata = { title: 'Preview', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * "Preview as the prospect" (spec §14.5).
 *
 * The rep's own tap shows the rep view (§8), so without this a rep never sees
 * what their prospect will see. The page below the tools is the REAL prospect
 * component, fed by the same loader as a real tap — the preview cannot drift
 * from the page.
 *
 * Nothing here records a view. A preview is not a tap (§10.4).
 */
export default async function PreviewPage({ params }: PageProps<'/sessions/[id]/preview'>) {
  const rep = await requireRep();
  const { id } = await params;

  const resolved = await previewForRep(rep.userId, id);
  if (!resolved) notFound();

  const { session } = resolved;

  // What is on the page right now — the starting point for an edit.
  const pitchOnPage = shownPitch(resolved);

  // The rep's judgement of the pitch the model wrote, if they have given one.
  const { data: rating } = session.generated_pitch
    ? await serviceClient()
        .from('pitch_ratings')
        .select('rating, reason')
        .eq('session_id', session.id)
        .eq('user_id', rep.userId)
        .eq('pitch', session.generated_pitch)
        .maybeSingle()
    : { data: null };

  const who = session.prospect_name?.trim().split(/\s+/)[0] ?? 'your prospect';

  return (
    <div className="pb-4">
      <Link
        href={`/sessions/${session.id}/edit`}
        className="text-ink-3 hover:text-ink-2 text-[13px] underline underline-offset-2"
      >
        ← Back to the details
      </Link>

      <h1 className="font-display text-ink mt-3 text-2xl font-bold tracking-tight">
        What {who} sees
      </h1>
      <p className="text-ink-3 mt-1 text-[13px]">
        A preview. Opening it here does not count as {who} looking.
      </p>

      <PitchTools
        sessionId={session.id}
        shownPitch={pitchOnPage}
        edited={Boolean(session.rep_pitch)}
        canRate={Boolean(session.generated_pitch)}
        rating={rating ? { rating: rating.rating, reason: rating.reason } : null}
      />

      <div className="border-line shadow-lifted bg-ground mt-6 overflow-hidden rounded-[28px] border">
        <ProspectView resolved={resolved} preview />
      </div>
    </div>
  );
}
