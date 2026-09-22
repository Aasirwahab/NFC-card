import { fail, json, readJson, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { composeBrief } from '@/lib/enrich/brief';
import { EMPTY_RESEARCH, type Research } from '@/lib/enrich/research';
import { reviewRepPitch } from '@/lib/enrich/review';
import { snapshotSchema } from '@/lib/enrich/snapshot';
import { repPitchSchema } from '@/lib/schemas/sessions';

/**
 * The rep's own edit of the prospect's pitch (spec §14.5).
 *
 *   PUT     { text }  save the edit        200 { warnings } | 422 { error, failures }
 *   DELETE            back to the generated pitch
 *
 * The edit is stored apart from generated_pitch, so a re-enrich never overwrites
 * it. It goes through the quality gate as warnings; only repeating the private
 * note is refused.
 */

type Context = { params: Promise<{ id: string }> };

function notFound(message: string | undefined) {
  return (message ?? '').includes('session_not_found');
}

export const PUT = withRep(async (rep, request, context: Context) => {
  const { id } = await context.params;

  const parsed = repPitchSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return fail('invalid_request', 400, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const db = serviceClient();

  // Ownership first: the snapshot RPC is not scoped by user.
  const { data: session } = await db
    .from('sessions')
    .select('research')
    .eq('id', id)
    .eq('user_id', rep.userId)
    .eq('status', 'active')
    .maybeSingle();
  if (!session) return fail('session_not_found', 404);

  const { data: rawSnapshot, error: snapshotError } = await db.rpc('enrichment_snapshot', {
    p_session_id: id,
  });
  if (snapshotError) throw new Error(`enrichment_snapshot failed: ${snapshotError.message}`);

  const snapshot = snapshotSchema.safeParse(rawSnapshot);
  if (!snapshot.success) throw new Error('enrichment_snapshot returned an unexpected shape');

  // Only the verified facts matter to the gate; anything malformed counts as none.
  const stored = session.research as Partial<Research> | null;
  const research: Research = {
    ...EMPTY_RESEARCH,
    facts: Array.isArray(stored?.facts) ? stored.facts.filter((f) => typeof f === 'string') : [],
  };

  const review = reviewRepPitch(parsed.data.text, composeBrief(snapshot.data, research));
  if (review.blocked.length > 0) {
    return fail(review.blocked[0]!.check, 422, { failures: review.blocked });
  }

  const { error } = await db.rpc('set_rep_pitch', {
    p_session_id: id,
    p_user_id: rep.userId,
    p_text: parsed.data.text,
  });
  if (error) {
    if (notFound(error.message)) return fail('session_not_found', 404);
    throw new Error(`set_rep_pitch failed: ${error.message}`);
  }

  return json({ warnings: review.warnings });
});

export const DELETE = withRep(async (rep, _request, context: Context) => {
  const { id } = await context.params;

  const { error } = await serviceClient().rpc('set_rep_pitch', {
    p_session_id: id,
    p_user_id: rep.userId,
    p_text: null,
  });
  if (error) {
    if (notFound(error.message)) return fail('session_not_found', 404);
    throw new Error(`set_rep_pitch failed: ${error.message}`);
  }

  return json({ reset: true });
});
