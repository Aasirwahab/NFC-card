/**
 * Colour tags (spec §10.3).
 *
 * Before handing a card over, the rep self-taps it and the screen shows
 * "Card 3 — Blue" as a private memory cue. When adding details later they pick
 * from "Card 1 (Red), Card 2 (Blue)..." rather than a raw code.
 *
 * Colours are digital only. Cards stay identical and cheap — no batch-print
 * customisation. Card 9 repeats Card 1's colour; shown with the number it is
 * still unambiguous.
 *
 * This list MIRRORS public.colour_for_sequence() in the database, which is the
 * source of truth because it assigns the value at registration. An integration
 * test asserts the two agree for the first several cycles.
 */
export const COLOUR_PALETTE = [
  'Red',
  'Blue',
  'Green',
  'Yellow',
  'Purple',
  'Orange',
  'Pink',
  'Teal',
] as const;

export type ColourTag = (typeof COLOUR_PALETTE)[number];

/** Hex values for the dot shown beside "Card 3" in the rep UI. */
export const COLOUR_HEX: Record<ColourTag, string> = {
  Red: '#DC2626',
  Blue: '#2563EB',
  Green: '#16A34A',
  Yellow: '#CA8A04',
  Purple: '#7C3AED',
  Orange: '#EA580C',
  Pink: '#DB2777',
  Teal: '#0D9488',
};

/**
 * The colour for a per-event sequence number. Sequence numbers start at 1.
 * Anything below 1 is clamped, matching the database function exactly.
 */
export function colourForSequence(sequence: number): ColourTag {
  const index = (Math.max(Math.trunc(sequence), 1) - 1) % COLOUR_PALETTE.length;
  // Safe: index is always within bounds, but noUncheckedIndexedAccess cannot see it.
  return COLOUR_PALETTE[index] ?? 'Red';
}
