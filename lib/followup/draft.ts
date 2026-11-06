/**
 * The follow-up drafts (spec §19.3).
 *
 * Written for the rep to send BY HAND, over LinkedIn or email. PURE and
 * deterministic: no model call, so a draft costs nothing and can never invent a
 * claim. They use four facts only: the rep's first name and company, the
 * prospect's first name, and the problem the rep recorded. Never the private note
 * or free text.
 *
 * Two hard rules: a draft never mentions tracking (no "I saw you opened", no "you
 * haven't looked yet"), and every draft says who it is from and ends with a plain
 * way to stop (docs/LEGAL_DRAFTS.md §4).
 */

export type FollowupChannel = 'linkedin' | 'email' | 'none';

/** The states that have a template. A dropped lead never gets one. */
export type DraftState = 'due-no-tap' | 'opened-no-action' | 'booked' | 'sent' | 'replied';

export const STOP_LINE = "Reply stop and I won't write again.";

export type FollowupInput = {
  channel: FollowupChannel;
  prospectName: string | null;
  repFullName: string;
  /** The problem they raised, as the rep recorded it. */
  problem: string | null;
  businessName: string | null;
  /** Defaults to the first no-tap note. */
  state?: DraftState;
};

export function followupChannel(session: {
  linkedin_url: string | null;
  prospect_email: string | null;
}): FollowupChannel {
  if (session.linkedin_url) return 'linkedin';
  if (session.prospect_email) return 'email';
  return 'none';
}

function first(name: string | null): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

/** Keeps a long problem from pushing a LinkedIn note past its limit. */
function shorten(topic: string): string {
  return topic.length <= 80 ? topic : topic.slice(0, 80).replace(/\s+\S*$/, '');
}

/** One sentence per state for a LinkedIn note. `t` is the lower-cased problem, if any. */
const SHORT: Record<DraftState, (t: string | null) => string> = {
  'due-no-tap': (t) =>
    t
      ? `Good to meet you. Following up on our chat about ${t}. Happy to share how we'd approach it if useful.`
      : 'Good to meet you. Happy to pick up where we left off whenever suits you.',
  'opened-no-action': (t) =>
    t
      ? `Following up on our chat about ${t}. Happy to send a couple of ideas, or find fifteen minutes that suit you.`
      : 'Following up on our chat. Happy to send a couple of ideas, or find fifteen minutes that suit you.',
  booked: (t) =>
    t
      ? `Thanks for making time to talk. I'll come with some thoughts on ${t}. Speak soon.`
      : "Thanks for making time to talk. I'll come with some thoughts. Speak soon.",
  sent: (t) =>
    t
      ? `A light nudge on my earlier note about ${t}. No pressure, happy to help whenever suits you.`
      : 'A light nudge on my earlier note. No pressure, happy to help whenever suits you.',
  replied: (t) =>
    t
      ? `Thanks for getting back to me. Happy to keep talking about ${t} whenever suits you.`
      : 'Thanks for getting back to me. Happy to keep talking whenever suits you.',
};

/** The body lines for an email, or anything without a LinkedIn note. */
const LONG: Record<DraftState, (t: string | null) => string[]> = {
  'due-no-tap': (t) => [
    'Good to meet you.',
    t
      ? `Following up on our chat about ${t}. I'd be glad to walk you through how we'd approach it, and fifteen minutes would be enough.`
      : "I'd be glad to pick up where we left off. Fifteen minutes would be enough.",
    '',
    'Would one day next week work?',
  ],
  'opened-no-action': (t) => [
    t ? `Following up on our chat about ${t}.` : 'Following up on our chat.',
    "I'm happy to send a couple of ideas, or to find fifteen minutes that suit you.",
    '',
    'Would one day next week work?',
  ],
  booked: (t) => [
    'Thanks for making time to talk.',
    t ? `I'll come with some thoughts on ${t}.` : "I'll come with some thoughts.",
    '',
    'Speak soon.',
  ],
  sent: (t) => [
    t ? `A light nudge on my earlier note about ${t}.` : 'A light nudge on my earlier note.',
    'No pressure at all. I am happy to help whenever suits you.',
  ],
  replied: (t) => [
    'Thanks for getting back to me.',
    t
      ? `I'm happy to keep talking about ${t} whenever suits you.`
      : "I'm happy to keep talking whenever suits you.",
  ],
};

export function composeFollowupDraft(input: FollowupInput): string {
  const them = first(input.prospectName);
  const me = first(input.repFullName) ?? input.repFullName;
  const hello = them ? `Hi ${them},` : 'Hi,';
  const state = input.state ?? 'due-no-tap';
  const topic = input.problem
    ? shorten(
        input.problem
          .trim()
          .replace(/[.!?]+$/, '')
          .toLowerCase(),
      ) || null
    : null;
  const from = input.businessName?.trim() ? `${me}, ${input.businessName.trim()}` : me;

  // Short enough for a connection note.
  if (input.channel === 'linkedin') {
    return [hello, SHORT[state](topic), from, STOP_LINE].join(' ');
  }

  return [hello, '', ...LONG[state](topic), '', from, '', STOP_LINE].join('\n');
}
