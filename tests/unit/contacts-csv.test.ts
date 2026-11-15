import { describe, expect, it } from 'vitest';
import { contactsCsv, type ContactExportRow } from '@/lib/export/contacts-csv';

const row: ContactExportRow = {
  id: 'session',
  events: { name: 'Café Expo' },
  event_sequence_number: 3,
  colour_tag: 'Blue',
  custom_problems: 'Slow quotes',
  registered_at: '2026-11-14T10:00:00+00:00',
  prospect_name: 'Zoë',
  prospect_company: 'Smith, "Jones"',
  prospect_email: null,
  prospect_submitted_email: 'zoe@example.test',
  prospect_phone: null,
  prospect_submitted_phone: '+447123456789',
  linkedin_url: null,
  prospect_website: null,
  problems: ['Reviews'],
  prospect_picked_problems: ['Bookings'],
  first_viewed_at: null,
  view_count: 0,
  bookings: [{ status: 'confirmed' }],
  followup_sent_at: null,
  followup_outcome: null,
  prospect_form_answers: [
    { label: 'Interested in?', value: 'Reviews' },
    { label: 'Team', value: 'Two' },
  ],
};

describe('contactsCsv', () => {
  it('writes BOM, accents, RFC 4180 quoting and CRLF records', () => {
    const csv = contactsCsv([row]);
    expect(
      csv.startsWith(
        '\uFEFFEvent,Card,Registered,Name,Company,Email,Phone,LinkedIn,Website,What they care about,First opened,Times opened,Meeting booked,Follow-up,Shared answers\r\n',
      ),
    ).toBe(true);
    expect(csv).toContain('Café Expo,3 (Blue),2026-11-14T10:00:00.000Z,Zoë,"Smith, ""Jones"""');
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(contactsCsv([])).toBe(csv.split('\r\n')[0] + '\r\n');
    expect(contactsCsv([{ ...row, prospect_name: 'one\rtwo\nthree' }])).toContain(
      '"one\rtwo\nthree"',
    );
  });

  it.each(['=1+1', '+cmd', '-1', '@SUM(A1)', '\tcmd', '\rcmd'])(
    'protects a cell starting with %j',
    (value) => {
      const csv = contactsCsv([{ ...row, prospect_name: value }]);
      expect(csv).toContain(value.startsWith('\r') ? `"'${value}"` : `'${value}`);
    },
  );

  it('maps fallback contact details, problems, bookings and shared answers', () => {
    const csv = contactsCsv([row]);
    expect(csv).toContain(
      "zoe@example.test,'+447123456789,,,Reviews; Bookings; Slow quotes,,0,Yes,,Interested in? Reviews; Team: Two",
    );
    expect(
      contactsCsv([
        {
          ...row,
          prospect_email: 'rep@example.test',
          prospect_phone: '07123456789',
          bookings: [{ status: 'cancelled' }],
          followup_sent_at: '2026-11-14',
        },
      ]),
    ).toContain('rep@example.test,07123456789,,,Reviews; Bookings; Slow quotes,,0,No,sent,');
  });

  it.each(['replied', 'dropped'] as const)('uses the %s outcome ahead of sent', (outcome) => {
    expect(
      contactsCsv([{ ...row, followup_sent_at: '2026-11-14', followup_outcome: outcome }]),
    ).toContain(`,Yes,${outcome},`);
  });

  it('lists each problem once, even when the prospect picked one the rep noted', () => {
    expect(
      contactsCsv([
        { ...row, prospect_picked_problems: ['Reviews', ' Bookings '], custom_problems: null },
      ]),
    ).toContain(',Reviews; Bookings,');
  });

  it('does not leak private fields even when supplied', () => {
    const privateRow = {
      ...row,
      memorable_info: 'PRIVATE NOTE',
      research: 'PRIVATE RESEARCH',
      pitch: 'PRIVATE PITCH',
      chat: 'PRIVATE CHAT',
    };
    expect(contactsCsv([privateRow])).not.toContain('PRIVATE');
  });

  it('handles absent relations, malformed answers and no bookings', () => {
    expect(
      contactsCsv([{ ...row, events: null, bookings: [], prospect_form_answers: {} }]),
    ).toContain(',3 (Blue),');
    expect(contactsCsv([{ ...row, bookings: [], prospect_form_answers: {} }])).toContain(
      ',No,,\r\n',
    );
  });
});
