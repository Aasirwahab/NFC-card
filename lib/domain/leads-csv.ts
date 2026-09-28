/**
 * An event's leads as CSV (spec §26 Phase 7): for the rep's own CRM or a
 * spreadsheet. The private note (`memorable_info`) is never included (§4, §23.1).
 * PURE.
 */

export type LeadRow = {
  event_sequence_number: number;
  colour_tag: string;
  prospect_name: string | null;
  prospect_company: string | null;
  prospect_email: string | null;
  prospect_phone: string | null;
  linkedin_url: string | null;
  prospect_website: string | null;
  problems: string[];
  custom_problems: string | null;
  registered_at: string;
  first_viewed_at: string | null;
  booked: boolean;
};

const HEADER = [
  'card',
  'colour',
  'name',
  'company',
  'email',
  'phone',
  'linkedin',
  'website',
  'problems',
  'registered_at',
  'opened_at',
  'booked',
];

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

export function leadsCsv(rows: LeadRow[]): string {
  const lines = rows.map((r) =>
    [
      r.event_sequence_number,
      r.colour_tag,
      r.prospect_name,
      r.prospect_company,
      r.prospect_email,
      r.prospect_phone,
      r.linkedin_url,
      r.prospect_website,
      [...r.problems, r.custom_problems].filter(Boolean).join('; ') || null,
      r.registered_at,
      r.first_viewed_at,
      r.booked ? 'yes' : 'no',
    ]
      .map(csvCell)
      .join(','),
  );
  return [HEADER.join(','), ...lines].join('\r\n');
}
