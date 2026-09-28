/**
 * The no-tap follow-up draft (spec §19.3).
 *
 * Written for the rep to send BY HAND, over LinkedIn or email, to a prospect who
 * has not opened their card a day after meeting. PURE and deterministic: no model
 * call, so a draft costs nothing and can never invent a claim.
 *
 * The one hard rule: a draft never mentions tracking. No "I saw you opened", no
 * "you haven't looked yet". It simply follows up on the conversation.
 */

export type FollowupChannel = 'linkedin' | 'email' | 'none';

export type FollowupInput = {
  channel: FollowupChannel;
  prospectName: string | null;
  repFullName: string;
  eventName: string | null;
  /** The problem they raised, as the rep recorded it. */
  problem: string | null;
  businessName: string | null;
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

export function composeFollowupDraft(input: FollowupInput): string {
  const them = first(input.prospectName);
  const me = first(input.repFullName) ?? input.repFullName;
  const hello = them ? `Hi ${them},` : 'Hi,';
  const where = input.eventName ? ` at ${input.eventName.trim()}` : '';
  const topic =
    input.problem
      ?.trim()
      .replace(/[.!?]+$/, '')
      .toLowerCase() ?? null;

  if (input.channel === 'linkedin') {
    // Short enough for a connection note.
    return [
      hello,
      `Good to meet you${where}.`,
      topic
        ? `I've been thinking about what you said on ${topic}. Happy to share how we'd approach it if useful.`
        : 'Happy to pick up where we left off whenever suits you.',
      me,
    ].join(' ');
  }

  const lines = [
    hello,
    '',
    `Good to meet you${where}.`,
    topic
      ? `You mentioned ${topic}. I've put down a few thoughts on how we'd approach it, and I'd be glad to walk you through them in fifteen minutes.`
      : "I'd be glad to pick up where we left off. Fifteen minutes would be enough.",
    '',
    'Would one day next week work?',
    '',
    me,
  ];
  if (input.businessName) lines.push(input.businessName.trim());
  return lines.join('\n');
}
