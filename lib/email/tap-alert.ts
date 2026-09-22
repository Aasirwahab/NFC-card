/**
 * "Tom just opened your card" — the email to the REP when a prospect first opens
 * their page (Phase 5).
 *
 * PURE. Built from what the rep already knows about their own lead. The private
 * note is deliberately not an input: it has no place in an email that crosses a
 * mail provider (§23.1).
 *
 * It also carries §19.3's rule to the one person who can break it: never tell the
 * prospect you saw them open the page.
 */

export type TapAlertInput = {
  repFirstName: string;
  prospectName: string | null;
  prospectCompany: string | null;
  problem: string | null;
  eventName: string | null;
  /** Absolute link to the session in the rep app. */
  sessionUrl: string;
};

export type Email = { subject: string; text: string; html: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function tapAlertEmail(input: TapAlertInput): Email {
  const first = input.prospectName?.trim().split(/\s+/)[0] || null;
  const who = first ?? 'Your prospect';
  const subject = `${who} just opened your card`;

  const details = [
    input.prospectName?.trim() || null,
    input.prospectCompany?.trim() || null,
    input.problem ? `talked about ${input.problem.trim().toLowerCase()}` : null,
    input.eventName ? `at ${input.eventName.trim()}` : null,
  ].filter(Boolean);

  const lines = [
    `Hi ${input.repFirstName},`,
    '',
    `${who} just opened the page on your card.${details.length ? ` (${details.join(' · ')})` : ''}`,
    '',
    'Now is a good moment to get in touch, while it is fresh.',
    '',
    `Open the session: ${input.sessionUrl}`,
    '',
    'When you do, follow up on your conversation. Don’t mention that you saw them open the page — it reads as being watched.',
    '',
    '— TapLead',
  ];

  const html = [
    `<p>Hi ${escapeHtml(input.repFirstName)},</p>`,
    `<p><strong>${escapeHtml(who)} just opened the page on your card.</strong>` +
      (details.length ? `<br>${escapeHtml(details.join(' · '))}` : '') +
      '</p>',
    '<p>Now is a good moment to get in touch, while it is fresh.</p>',
    `<p><a href="${escapeHtml(input.sessionUrl)}">Open the session</a></p>`,
    '<p style="color:#6b7977">When you do, follow up on your conversation. ' +
      'Don’t mention that you saw them open the page — it reads as being watched.</p>',
    '<p>— TapLead</p>',
  ].join('\n');

  return { subject, text: lines.join('\n'), html };
}
