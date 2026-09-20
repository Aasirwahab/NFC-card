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

export function viewForSession(session: {
  enrichment_status: string;
  generated_pitch: string | null;
}): ProspectView {
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
