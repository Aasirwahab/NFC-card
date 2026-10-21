/**
 * The four render states of the landing page (spec §16).
 *
 * PURE. It maps an enrichment status onto what the prospect sees, and it is a
 * closed union so the page cannot forget to handle one of them.
 *
 * | state      | what the prospect sees                                  |
 * |------------|---------------------------------------------------------|
 * | completed  | the researched pitch — the intended experience           |
 * | crafting   | "Putting something together for you — one moment."       |
 * | failed     | the deterministic template pitch; they cannot tell       |
 * | pending    | a warm generic page; honest, still useful                |
 */

export type ProspectView =
  | { state: 'completed'; pitch: string }
  | { state: 'crafting' }
  | { state: 'failed' }
  | { state: 'pending' };

/**
 * Whether a rep who reviews before publishing still owes an approval. Only a
 * finished pitch (written or template) that existed when the rep approved is
 * released: while a new run is queued or processing, or once a newer one has
 * landed, the prospect sees the holding page again. PURE.
 */
export function heldForReview(
  reviewBeforeLive: boolean,
  session: {
    enrichment_status: string;
    pitch_approved_at: string | null;
    enrichment_completed_at: string | null;
  },
): boolean {
  if (!reviewBeforeLive) return false;
  const approved = session.pitch_approved_at;
  if (!approved) return true;
  if (session.enrichment_status !== 'completed' && session.enrichment_status !== 'failed') {
    return true;
  }
  const completed = session.enrichment_completed_at;
  return Boolean(completed && Date.parse(completed) > Date.parse(approved));
}

export function viewForSession(
  session: {
    enrichment_status: string;
    generated_pitch: string | null;
    /** The rep's own edit (§14.5). When set, it IS the pitch, whatever the status. */
    rep_pitch?: string | null;
  },
  /** The rep asked to review pitches and has not approved this one yet. */
  held = false,
): ProspectView {
  // The rep has read and rewritten this pitch themselves. Nothing the pipeline
  // does afterwards — a retry, a failure, a fresh pitch — replaces their words.
  if (session.rep_pitch?.trim()) return { state: 'completed', pitch: session.rep_pitch };

  // Held for review: the warm page, never the generated or template pitch, until
  // the rep approves it or writes their own.
  if (held) return { state: 'pending' };

  switch (session.enrichment_status) {
    case 'completed':
      // A completed session with no pitch should be impossible, but rendering a
      // blank page because of it would be the one failure this product cannot
      // have. Fall through to the deterministic template instead.
      return session.generated_pitch
        ? { state: 'completed', pitch: session.generated_pitch }
        : { state: 'failed' };
    case 'queued':
    case 'processing':
      return { state: 'crafting' };
    case 'failed':
      return { state: 'failed' };
    case 'pending':
    default:
      // An unrecognised status — a future migration adding one — must not take
      // the landing page down.
      return { state: 'pending' };
  }
}
