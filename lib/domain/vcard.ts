/**
 * The rep's contact card, as a vCard 3.0 file (RFC 2426) — the version both iOS
 * and Android open straight into "Add contact".
 *
 * PURE. It only ever describes the REP: nothing about the prospect goes in, so
 * a card passed from hand to hand gives away nothing but the rep's own details.
 */

export type ContactCard = {
  fullName: string;
  title: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  linkedinUrl: string | null;
  website: string | null;
  /** e.g. "Met at Plant Hire Expo" — so the contact still makes sense in a month. */
  note: string | null;
};

/** RFC 2426 §4: backslash, comma, semicolon and newlines are escaped in text values. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * Lines longer than 75 octets are folded: CRLF then a single space (RFC 2425
 * §5.8.1). Folding by UTF-8 octets, without splitting a multi-byte character.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let size = 0;
  // The first line may use 75 octets; continuations lose one to the leading space.
  let limit = 75;

  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
      limit = 74;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** Splits "Zaid Hameer" into the structured N field: family;given. */
function structuredName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return `;${escapeText(parts[0] ?? '')};;;`;
  const family = parts[parts.length - 1]!;
  const given = parts.slice(0, -1).join(' ');
  return `${escapeText(family)};${escapeText(given)};;;`;
}

export function buildVCard(card: ContactCard): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  const text = (key: string, value: string | null) => {
    const trimmed = value?.trim();
    if (trimmed) lines.push(`${key}:${escapeText(trimmed)}`);
  };
  // URIs are not text values: escaping a comma inside one would break the link.
  const uri = (key: string, value: string | null) => {
    const trimmed = value?.trim();
    if (trimmed && /^https?:\/\//i.test(trimmed)) lines.push(`${key}:${trimmed}`);
  };

  lines.push(`N:${structuredName(card.fullName)}`);
  text('FN', card.fullName);
  text('ORG', card.company);
  text('TITLE', card.title);
  text('TEL;TYPE=CELL', card.phone);
  text('EMAIL;TYPE=INTERNET', card.email);
  uri('URL', card.website);
  uri('X-SOCIALPROFILE;TYPE=linkedin', card.linkedinUrl);
  text('NOTE', card.note);
  lines.push('END:VCARD');

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** A filename a phone will show: letters, digits and spaces only. */
export function vCardFilename(fullName: string): string {
  const safe = fullName
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim();
  return `${safe || 'contact'}.vcf`;
}
