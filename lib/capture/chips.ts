import type { Niche } from '@/lib/db/rep';

/**
 * The problem chips on the capture form. An event's own areas and problems come first. A
 * card with none (filed under "Unsorted", or an event with no problems set up) falls back
 * to the rep's playbook problems, so the rep can still tick what the prospect raised and
 * the pitch has something real to be written around (council 2026-10-30). PURE.
 */
export function eventHasProblems(niches: Niche[]): boolean {
  return niches.some((n) => n.problems.length > 0);
}

/** The chips to show for the selected niche, else the playbook fallback. */
export function chipProblems(niches: Niche[], niche: string, fallback: string[]): string[] {
  const own = niches.find((n) => n.name === niche)?.problems ?? [];
  if (own.length > 0) return own;
  return eventHasProblems(niches) ? [] : fallback;
}

/** What the "say it or type it" note reader may choose from. A fallback niche has no real name. */
export const FALLBACK_NICHE = 'Common problems';

export function noteNiches(niches: Niche[], fallback: string[]): Niche[] {
  if (eventHasProblems(niches) || fallback.length === 0) return niches;
  return [{ name: FALLBACK_NICHE, problems: fallback }];
}

/**
 * Only problems whose chip is on screen may be saved. A tick can outlive its chip (the lead
 * is moved to another event, a draft is restored, the note reader names another area), and
 * a problem the rep can no longer see must never feed the pitch. PURE.
 */
export function keepVisible(selected: string[], visible: string[]): string[] {
  return selected.filter((p) => visible.includes(p));
}
