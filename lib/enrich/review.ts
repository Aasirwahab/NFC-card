import type { Brief } from './brief';
import { qualityGate, type GateFailure } from './gate';

/**
 * The quality gate, applied to the REP's own edit of a pitch (spec §14.5).
 *
 * The rep owns their own words, so the gate's findings are warnings, not blocks:
 * a rep who writes 50 words, or names a price they know is right, is making a
 * choice the gate cannot second-guess.
 *
 * One finding still blocks: repeating the private note (§14.2, §23.1). The note
 * exists because a human was in the room; printing it on the prospect's page
 * reads as surveillance whoever typed it.
 */
export type PitchReview = { blocked: GateFailure[]; warnings: GateFailure[] };

const BLOCKING = new Set<GateFailure['check']>(['echoes_note', 'empty']);

export function reviewRepPitch(text: string, brief: Brief): PitchReview {
  const { failures } = qualityGate(text, brief);
  return {
    blocked: failures.filter((f) => BLOCKING.has(f.check)),
    warnings: failures.filter((f) => !BLOCKING.has(f.check)),
  };
}
