import type { Row } from '@/lib/db/types';
import { answerLine, parseContactFormAnswers } from '@/lib/domain/contact-form';

export type ContactExportRow = Pick<
  Row<'sessions'>,
  | 'id'
  | 'event_sequence_number'
  | 'colour_tag'
  | 'custom_problems'
  | 'registered_at'
  | 'prospect_name'
  | 'prospect_company'
  | 'prospect_email'
  | 'prospect_submitted_email'
  | 'prospect_phone'
  | 'prospect_submitted_phone'
  | 'linkedin_url'
  | 'prospect_website'
  | 'problems'
  | 'prospect_picked_problems'
  | 'first_viewed_at'
  | 'view_count'
  | 'followup_sent_at'
  | 'followup_outcome'
  | 'prospect_form_answers'
> & {
  events: { name: string } | null;
  bookings: { status: string }[];
};

/**
 * RFC 4180 quoting, plus a guard against spreadsheet formula injection: a cell a
 * prospect influenced that starts with = + - @ is prefixed with a quote mark.
 */
export function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const HEADER = [
  'Event',
  'Card',
  'Registered',
  'Name',
  'Company',
  'Email',
  'Phone',
  'LinkedIn',
  'Website',
  'What they care about',
  'First opened',
  'Times opened',
  'Meeting booked',
  'Follow-up',
  'Shared answers',
];

/** Explicit columns keep private notes, research, pitches and chat out of the file. */
export function contactsCsv(rows: ContactExportRow[]): string {
  const lines = rows.map((row) =>
    [
      row.events?.name ?? '',
      `${row.event_sequence_number} (${row.colour_tag})`,
      new Date(row.registered_at).toISOString(),
      row.prospect_name,
      row.prospect_company,
      row.prospect_email || row.prospect_submitted_email,
      row.prospect_phone || row.prospect_submitted_phone,
      row.linkedin_url,
      row.prospect_website,
      [
        ...new Set(
          [...row.problems, ...(row.prospect_picked_problems ?? []), row.custom_problems ?? '']
            .map((p) => p.trim())
            .filter(Boolean),
        ),
      ].join('; '),
      row.first_viewed_at ? new Date(row.first_viewed_at).toISOString() : '',
      row.view_count,
      row.bookings.some((booking) => booking.status === 'confirmed') ? 'Yes' : 'No',
      row.followup_outcome ?? (row.followup_sent_at ? 'sent' : ''),
      parseContactFormAnswers(row.prospect_form_answers).map(answerLine).join('; '),
    ]
      .map(csvCell)
      .join(','),
  );
  return '\uFEFF' + [HEADER.join(','), ...lines, ''].join('\r\n');
}
