import { answerLine, type ContactFormAnswer } from '@/lib/domain/contact-form';
import type { Email } from './tap-alert';

export type ContactAlertInput = {
  repFirstName: string;
  prospectName: string | null;
  email: string | null;
  phone: string | null;
  answers: ContactFormAnswer[];
  sessionUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Only the shared contact and saved answer snapshots leave the app. */
export function contactAlertEmail(input: ContactAlertInput): Email {
  const first = input.prospectName?.trim().split(/\s+/)[0] || 'Someone';
  const subject = `${first} shared their details`;
  const details = [input.email, input.phone, ...input.answers.map(answerLine)].filter(
    (line): line is string => Boolean(line),
  );
  return {
    subject,
    text: [
      `Hi ${input.repFirstName},`,
      '',
      subject,
      '',
      ...details,
      '',
      `Open their contact page: ${input.sessionUrl}`,
    ].join('\n'),
    html: [
      `<p>Hi ${escapeHtml(input.repFirstName)},</p>`,
      `<p><strong>${escapeHtml(subject)}</strong></p>`,
      ...details.map((line) => `<p>${escapeHtml(line)}</p>`),
      `<p><a href="${escapeHtml(input.sessionUrl)}">Open their contact page</a></p>`,
    ].join('\n'),
  };
}
