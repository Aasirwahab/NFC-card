import { callToAction, primaryProblem, publicEventName } from '@/lib/domain/pitch';
import type { Research } from './research';
import type { Snapshot } from './snapshot';

/**
 * Step 4: compose the brief the pitch is written from (§14). PURE — no I/O.
 *
 * Everything the pitch model is allowed to know, in one structure. Keeping it
 * explicit is what makes the quality gate possible: "no unsupported claims"
 * means "nothing that is not in the brief", and that is only checkable if the
 * brief is a concrete thing.
 */
export type Brief = {
  revision: number;
  prospect: { firstName: string | null; company: string | null };
  problems: string[];
  primaryProblem: string | null;
  customProblem: string | null;
  niche: string | null;
  /**
   * The rep's private note. It is NEVER put in a prompt (decision 2026-09-29,
   * after an A/B test: with it, half the drafts echoed it and were rejected, and
   * two of six fell back to the template; without it, none did). It stays here
   * only so the quality gate can still refuse a note that happens to echo it.
   */
  privateNote: string | null;
  /** The rep's style request for this draft. Style only: it never adds a fact or a claim. */
  guidance: string | null;
  rep: {
    firstName: string;
    fullName: string;
    title: string | null;
    language: 'en-GB' | 'en-US';
  };
  business: {
    name: string | null;
    tagline: string | null;
    services: string[];
    /** Every price the pitch may quote. Anything else is an invented price. */
    pricing: string | null;
    knowledge: string;
  };
  /** Verified public facts about the prospect's company. */
  facts: string[];
  eventName: string | null;
  cta: string;
};

const KNOWLEDGE_CAP = 3_000;

function firstName(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

function pricingText(snapshot: Snapshot): string | null {
  const parts: string[] = [];
  for (const entry of snapshot.knowledge) {
    if (entry.topic === 'pricing' && entry.content.trim()) parts.push(entry.content.trim());
  }
  const structured = snapshot.business?.pricing;
  if (structured !== null && structured !== undefined) parts.push(JSON.stringify(structured));
  return parts.length > 0 ? parts.join('\n') : null;
}

function knowledgeText(snapshot: Snapshot): string {
  return snapshot.knowledge
    .filter((entry) => entry.topic !== 'pricing' && entry.content.trim())
    .map((entry) => `${entry.topic}: ${entry.content.trim()}`)
    .join('\n\n')
    .slice(0, KNOWLEDGE_CAP);
}

export function composeBrief(snapshot: Snapshot, research: Research): Brief {
  const { session } = snapshot;
  const repFullName = snapshot.rep?.full_name?.trim() || 'the team';
  const repFirstName = firstName(repFullName) ?? repFullName;

  return {
    revision: session.details_revision,
    prospect: {
      firstName: firstName(session.prospect_name),
      company: session.prospect_company?.trim() || null,
    },
    problems: session.problems.map((p) => p.trim()).filter(Boolean),
    primaryProblem: primaryProblem({
      problems: session.problems,
      customProblems: session.custom_problems,
    }),
    customProblem: session.custom_problems?.trim() || null,
    niche: session.niche?.trim() || null,
    privateNote: session.memorable_info?.trim() || null,
    guidance: session.pitch_guidance?.trim().slice(0, 200) || null,
    rep: {
      firstName: repFirstName,
      fullName: repFullName,
      title: snapshot.rep?.title ?? null,
      language: snapshot.rep?.language ?? 'en-GB',
    },
    business: {
      name: snapshot.business?.company_name?.trim() || null,
      tagline: snapshot.business?.tagline?.trim() || null,
      services: (snapshot.business?.services ?? []).map((s) => s.trim()).filter(Boolean),
      pricing: pricingText(snapshot),
      knowledge: knowledgeText(snapshot),
    },
    // An unconfirmed guess may be a different company with the same name. Its
    // facts wait for the rep's "yes, that's their site" in the preview; until
    // then the pitch is written from the conversation alone.
    facts: research.domainSource === 'guess' ? [] : research.facts,
    eventName: publicEventName(snapshot.event?.name),
    cta: callToAction({
      problems: session.problems,
      customProblems: session.custom_problems,
      repName: repFirstName,
    }),
  };
}

/** All the text the pitch may legitimately draw on — the "brief" of "not in the brief". */
export function briefText(brief: Brief): string {
  return [
    brief.prospect.company,
    brief.problems.join(' '),
    brief.customProblem,
    brief.niche,
    brief.business.name,
    brief.business.tagline,
    brief.business.services.join(' '),
    brief.business.pricing,
    brief.business.knowledge,
    brief.facts.join(' '),
    brief.eventName,
    brief.cta,
  ]
    .filter(Boolean)
    .join(' ');
}
