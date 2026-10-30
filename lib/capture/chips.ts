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

/** Several areas can be ticked at once; they are stored in the one niche column, joined by this. */
const NICHE_SEPARATOR = ' | ';

/** The areas ticked on a saved lead. Only areas that still exist; none stored means the first. PURE. */
export function parseNicheList(stored: string | null | undefined, niches: Niche[]): string[] {
  const names = new Set(niches.map((n) => n.name));
  const picked = (stored ?? '')
    .split(NICHE_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => names.has(s));
  if (picked.length > 0) return [...new Set(picked)];
  return niches[0] ? [niches[0].name] : [];
}

/** The value saved in the niche column (80 characters at most, the schema limit). PURE. */
export function joinNiches(selected: string[]): string {
  return selected.join(NICHE_SEPARATOR).slice(0, 80);
}

/** Chips for every ticked area, without repeats. With none ticked, the playbook fallback applies. PURE. */
export function chipProblemsForAll(
  niches: Niche[],
  selected: string[],
  fallback: string[],
): string[] {
  if (selected.length === 0) return chipProblems(niches, '', fallback);
  return [...new Set(selected.flatMap((name) => chipProblems(niches, name, fallback)))];
}

/** The most problems a rep can tick: the page is written around them, and too many blur it. */
export const MAX_TICKED_PROBLEMS = 5;

/** Chips shown before "Show more". Ticked chips always show, first. */
export const CHIPS_SHOWN = 8;

/**
 * The first few chips in their own order, plus any ticked chip further down, so a tap never
 * moves the chips under the rep's finger and a ticked chip is never hidden. PURE.
 */
export function visibleChips(
  all: string[],
  selected: string[],
  expanded: boolean,
  limit = CHIPS_SHOWN,
): { shown: string[]; hiddenCount: number } {
  const shown = all.filter((c, i) => expanded || i < limit || selected.includes(c));
  return { shown, hiddenCount: all.length - shown.length };
}
