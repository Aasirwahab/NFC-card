import type { Email } from './tap-alert';

/**
 * The morning-after event email to the REP (2026-09-25 review).
 *
 * One email that does two jobs: shows the rep what the event produced (a reason
 * to come back) and lists the cards that still need details (the thing that
 * decides whether the pitches are any good). Round 2, at 48 hours, is only sent
 * while something is still missing.
 *
 * PURE. Nothing about the prospects beyond what the rep already sees in their own
 * dashboard; never the private note (§23.1).
 */

export type DigestCard = { sequence: number; colour: string; firstName: string | null };

export type EventDigestInput = {
  round: 1 | 2;
  repFirstName: string;
  eventName: string;
  handedOut: number;
  opened: number;
  booked: number;
  needsDetails: DigestCard[];
  /** Detailed, but no email or LinkedIn: no way to follow up if they never tap. */
  noChannel: number;
  dashboardUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function cardLabel(card: DigestCard): string {
  return `Card ${card.sequence} (${card.colour})${card.firstName ? ` — ${card.firstName}` : ''}`;
}

export function eventDigestEmail(input: EventDigestInput): Email {
  const missing = input.needsDetails.length;
  const subject =
    input.round === 2
      ? `${plural(missing, 'card', 'cards')} from ${input.eventName} still need details`
      : missing > 0
        ? `${input.eventName}: ${input.opened} opened, ${plural(missing, 'card needs', 'cards need')} details`
        : `${input.eventName}: ${input.opened} of ${input.handedOut} opened so far`;

  // "Registered", not "handed out": cards can be activated before the event, and
  // some of those never leave the rep's hand.
  const results = `${plural(input.handedOut, 'card', 'cards')} registered · ${input.opened} opened · ${plural(input.booked, 'meeting', 'meetings')} booked`;
  const releaseHint =
    'Didn’t hand some of these out? Tap each one and release it for your next event.';

  const lines = [
    `Hi ${input.repFirstName},`,
    '',
    input.round === 2 ? `A last nudge about ${input.eventName}.` : `How ${input.eventName} went:`,
    results,
    '',
  ];

  if (missing > 0) {
    lines.push(
      `${plural(missing, 'card still needs', 'cards still need')} details. Until you add them, those people see a general page instead of one written for them:`,
      ...input.needsDetails.map((card) => `  • ${cardLabel(card)}`),
      '',
      releaseHint,
      '',
    );
  }
  if (input.noChannel > 0) {
    lines.push(
      `${plural(input.noChannel, 'person has', 'people have')} no email or LinkedIn saved — if they never tap, you have no way to follow up.`,
      '',
    );
  }
  lines.push(`Open your dashboard: ${input.dashboardUrl}`, '', '— TapLead');

  const html = [
    `<p>Hi ${escapeHtml(input.repFirstName)},</p>`,
    `<p>${escapeHtml(input.round === 2 ? `A last nudge about ${input.eventName}.` : `How ${input.eventName} went:`)}<br><strong>${escapeHtml(results)}</strong></p>`,
    missing > 0
      ? `<p>${escapeHtml(plural(missing, 'card still needs', 'cards still need'))} details. Until you add them, those people see a general page instead of one written for them:</p>` +
        `<ul>${input.needsDetails.map((card) => `<li>${escapeHtml(cardLabel(card))}</li>`).join('')}</ul>` +
        `<p style="color:#6b7977">${escapeHtml(releaseHint)}</p>`
      : '',
    input.noChannel > 0
      ? `<p>${escapeHtml(plural(input.noChannel, 'person has', 'people have'))} no email or LinkedIn saved — if they never tap, you have no way to follow up.</p>`
      : '',
    `<p><a href="${escapeHtml(input.dashboardUrl)}">Open your dashboard</a></p>`,
    '<p>— TapLead</p>',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, text: lines.join('\n'), html };
}
