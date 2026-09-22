/**
 * The template pitch and the call to action (spec §16).
 *
 * This is the `failed` render state — what a prospect sees when enrichment ran out
 * of attempts. It is assembled deterministically from the problem they actually
 * stated, the business profile, and nothing else. The prospect cannot tell
 * anything went wrong, because it is still specific to the problem they raised.
 *
 * PURE. No I/O, no model, no randomness. Two consequences that matter:
 *   - it can be unit-tested, and it is
 *   - it can be rendered when the model provider is down (§24.3), which is the
 *     whole point of having it
 *
 * It must also pass the Phase 4 quality gate (§14.2) — no placeholders, names the
 * right person, references the stated problem, 60-180 words, has a CTA. A
 * fallback that the gate would reject is not a fallback.
 */

export type PitchInput = {
  prospectName: string | null;
  prospectCompany: string | null;
  problems: string[];
  customProblems: string | null;
  repName: string;
  businessName: string | null;
  /** From the business profile. Used to say what is actually on offer. */
  services: string[];
  eventName: string | null;
};

/** The problem to lead with: the first selected one, else the free text. */
export function primaryProblem(input: {
  problems: string[];
  customProblems: string | null;
}): string | null {
  const selected = input.problems.find((p) => p.trim().length > 0);
  if (selected) return selected.trim();

  const custom = input.customProblems?.trim();
  if (!custom) return null;

  // The rep may have typed several lines or a sentence. Take the first clause,
  // because this ends up mid-sentence in the pitch and in the CTA.
  const firstLine = custom.split(/[\n.;]/)[0]?.trim();
  return firstLine && firstLine.length > 0 ? firstLine : custom;
}

/** Lower-cases a problem for use mid-sentence, unless it starts with an acronym. */
function midSentence(problem: string): string {
  const firstWord = problem.split(/\s+/)[0] ?? '';
  const isAcronym = firstWord.length > 1 && firstWord === firstWord.toUpperCase();
  return isAcronym ? problem : problem.charAt(0).toLowerCase() + problem.slice(1);
}

/**
 * Problem-specific CTA text (§16, §5). "Book 15 minutes on maritime compliance
 * automation", never "Book a demo".
 */
export function callToAction(input: {
  problems: string[];
  customProblems: string | null;
  repName: string;
}): string {
  const problem = primaryProblem(input);
  if (!problem) return `Book 15 minutes with ${input.repName}`;

  // Keep it to one line on a phone. A long free-text problem gets trimmed at a
  // word boundary rather than mid-word.
  const subject = midSentence(problem);
  const trimmed =
    subject.length <= 48 ? subject : `${subject.slice(0, 48).replace(/\s+\S*$/, '')}…`;

  return `Book 15 minutes on ${trimmed}`;
}

/** The greeting, which has to work when the rep never captured a name. */
export function greeting(prospectName: string | null): string {
  const name = prospectName?.trim().split(/\s+/)[0];
  return name ? `Hi ${name},` : 'Hi,';
}

/**
 * The deterministic pitch. Roughly 70-130 words depending on how much the rep
 * captured, which sits inside the quality gate's 60-180 window.
 */
export function templatePitch(input: PitchInput): string {
  const problem = primaryProblem(input);
  const business = input.businessName?.trim() || `${input.repName}'s team`;
  const company = input.prospectCompany?.trim();
  const where = input.eventName?.trim();

  const sentences: string[] = [];

  sentences.push(
    where ? `It was good to meet you at ${where}.` : `It was good to meet you the other day.`,
  );

  if (problem) {
    sentences.push(
      company
        ? `You mentioned ${midSentence(problem)} at ${company}, and that is the kind of thing we spend most of our time on.`
        : `You mentioned ${midSentence(problem)}, and that is the kind of thing we spend most of our time on.`,
    );
  } else if (company) {
    sentences.push(`I wanted to follow up properly rather than leave you with a card.`);
    sentences.push(`We work with teams like ${company} on exactly this kind of problem.`);
  } else {
    sentences.push(`I wanted to follow up properly rather than leave you with a card.`);
  }

  // Services are stored as labels ("Plant hire automation") but read mid-sentence
  // here, so they take the same lowercasing as the problem.
  const services = input.services
    .map((s) => s.trim())
    .filter(Boolean)
    .map(midSentence);
  if (services.length > 0) {
    sentences.push(`${business} does ${listPhrase(services.slice(0, 3))}.`);
  } else {
    sentences.push(`${business} works on problems like it every week.`);
  }

  sentences.push(
    problem
      ? `The honest answer to whether we can help with ${midSentence(problem)} takes about fifteen minutes to give properly, and I would rather give you a straight one than a brochure.`
      : `The honest answer to whether we can help takes about fifteen minutes to give properly, and I would rather give you a straight one than a brochure.`,
  );

  sentences.push(
    `If it is useful, pick a time below. If it is not, no hard feelings — ${input.repName}.`,
  );

  return sentences.join(' ');
}

/** "a, b and c" — the Oxford-comma-free British form the rest of the copy uses. */
function listPhrase(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]!}`;
}

/** Word count, for the quality gate and for the tests that police this file. */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
