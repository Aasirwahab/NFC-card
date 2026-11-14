import type { Email } from './tap-alert';

/**
 * The Monday rep digest (2026-11-14).
 *
 * One email, three lists, each something the rep can act on in a minute:
 * people who opened their page and have not booked, follow-up drafts ready to
 * send, and questions the assistant passed to them. Last week's numbers lead,
 * because they are the reason to keep going.
 *
 * PURE. Only what the rep already sees in their own dashboard: first names and
 * companies, never the private notes or what a prospect typed (§23.1).
 */

export type WarmLead = {
  sessionId: string;
  firstName: string | null;
  company: string | null;
  /** Whole days since the page was first opened. */
  daysSinceOpened: number;
};

export type WeeklyDigestInput = {
  repFirstName: string;
  /** Last 7 days. */
  registered: number;
  opened: number;
  booked: number;
  /** Opened, not booked, oldest first. The caller caps the list. */
  warm: WarmLead[];
  /** All warm leads, when the list above was capped. */
  warmTotal: number;
  draftsReady: number;
  questionsWaiting: number;
  appUrl: string;
};

/** Nothing to act on and nothing happened: the handler sends no email. */
export function weeklyDigestIsEmpty(input: Omit<WeeklyDigestInput, 'appUrl'>): boolean {
  return (
    input.registered + input.opened + input.booked === 0 &&
    input.warmTotal === 0 &&
    input.draftsReady === 0 &&
    input.questionsWaiting === 0
  );
}

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

function leadLabel(lead: WarmLead): string {
  const who = lead.firstName ?? 'Someone';
  const at = lead.company ? ` at ${lead.company}` : '';
  const when =
    lead.daysSinceOpened <= 0
      ? 'opened today'
      : `opened ${plural(lead.daysSinceOpened, 'day', 'days')} ago`;
  return `${who}${at}, ${when}`;
}

export function weeklyDigestEmail(input: WeeklyDigestInput): Email {
  const link = (path: string) => new URL(path, input.appUrl).toString();
  const todo = [
    input.warmTotal > 0
      ? plural(input.warmTotal, 'person to follow up', 'people to follow up')
      : '',
    input.questionsWaiting > 0
      ? plural(input.questionsWaiting, 'question waiting', 'questions waiting')
      : '',
  ].filter(Boolean);

  const subject = todo.length
    ? `Your week: ${todo.join(', ')}`
    : `Your week: ${input.opened} opened, ${plural(input.booked, 'meeting', 'meetings')} booked`;

  const results = `${plural(input.registered, 'card', 'cards')} handed out · ${input.opened} opened · ${plural(input.booked, 'meeting', 'meetings')} booked`;
  const more = input.warmTotal - input.warm.length;

  const text: string[] = [`Hi ${input.repFirstName},`, '', 'Your last 7 days:', results, ''];
  const html: string[] = [
    `<p>Hi ${escapeHtml(input.repFirstName)},</p>`,
    `<p>Your last 7 days:<br><strong>${escapeHtml(results)}</strong></p>`,
  ];

  if (input.warm.length > 0) {
    const lead =
      'These people opened your page and have not booked yet. A short note now lands best:';
    text.push(
      lead,
      ...input.warm.map((w) => `  • ${leadLabel(w)}: ${link(`/sessions/${w.sessionId}/edit`)}`),
    );
    if (more > 0) text.push(`  …and ${more} more on your dashboard.`);
    text.push('');
    html.push(
      `<p>${escapeHtml(lead)}</p><ul>${input.warm
        .map(
          (w) =>
            `<li><a href="${escapeHtml(link(`/sessions/${w.sessionId}/edit`))}">${escapeHtml(leadLabel(w))}</a></li>`,
        )
        .join('')}${more > 0 ? `<li>…and ${more} more on your dashboard.</li>` : ''}</ul>`,
    );
  }

  if (input.draftsReady > 0) {
    const line = `${plural(input.draftsReady, 'follow-up draft is', 'follow-up drafts are')} ready to check and send.`;
    text.push(line, '');
    html.push(`<p>${escapeHtml(line)}</p>`);
  }

  if (input.questionsWaiting > 0) {
    const answer = input.questionsWaiting === 1 ? 'Answer it' : 'Answer them';
    const line = `Your assistant passed ${plural(input.questionsWaiting, 'question', 'questions')} to you. Answer once and it can answer the next person itself.`;
    text.push(line, `${answer}: ${link('/settings#questions')}`, '');
    html.push(
      `<p>${escapeHtml(line)} <a href="${escapeHtml(link('/settings#questions'))}">${escapeHtml(answer)}</a></p>`,
    );
  }

  const off = 'You get this on Mondays. Turn it off in Setup.';
  text.push(`Open your dashboard: ${link('/dashboard')}`, '', off, '— INSIGNAR');
  html.push(
    `<p><a href="${escapeHtml(link('/dashboard'))}">Open your dashboard</a></p>`,
    `<p style="color:#6f685f">${escapeHtml(off)}</p>`,
    '<p>— INSIGNAR</p>',
  );

  return { subject, text: text.join('\n'), html: html.join('\n') };
}
