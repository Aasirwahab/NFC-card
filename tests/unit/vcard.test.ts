import { describe, expect, it } from 'vitest';
import {
  buildVCard,
  escapeText,
  foldLine,
  vCardFilename,
  type ContactCard,
} from '@/lib/domain/vcard';

const zaid: ContactCard = {
  fullName: 'Zaid Hameer',
  title: 'Founder',
  company: 'TMA',
  phone: '07700 900112',
  email: 'zaid@tma.example',
  linkedinUrl: 'https://www.linkedin.com/in/zaid',
  website: 'https://tma.example',
  note: 'Met at Plant Hire Expo',
};

describe('buildVCard', () => {
  it('writes a vCard 3.0 that phones open as a contact', () => {
    const card = buildVCard(zaid);
    expect(card.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true);
    expect(card.endsWith('END:VCARD\r\n')).toBe(true);
    expect(card).toContain('N:Hameer;Zaid;;;\r\n');
    expect(card).toContain('FN:Zaid Hameer\r\n');
    expect(card).toContain('ORG:TMA\r\n');
    expect(card).toContain('TEL;TYPE=CELL:07700 900112\r\n');
    expect(card).toContain('EMAIL;TYPE=INTERNET:zaid@tma.example\r\n');
    expect(card).toContain('URL:https://tma.example\r\n');
    expect(card).toContain('NOTE:Met at Plant Hire Expo\r\n');
  });

  it('leaves out anything the rep did not fill in', () => {
    const card = buildVCard({
      fullName: 'Zaid',
      title: null,
      company: null,
      phone: '  ',
      email: null,
      linkedinUrl: null,
      website: null,
      note: null,
    });
    expect(card).toBe('BEGIN:VCARD\r\nVERSION:3.0\r\nN:;Zaid;;;\r\nFN:Zaid\r\nEND:VCARD\r\n');
  });

  it('drops a link that is not http(s), rather than writing a broken one', () => {
    const card = buildVCard({
      ...zaid,
      website: 'javascript:alert(1)',
      linkedinUrl: 'linkedin.com/in/x',
    });
    expect(card).not.toContain('URL:');
    expect(card).not.toContain('X-SOCIALPROFILE');
  });

  it('cannot be broken out of by a value with newlines or separators', () => {
    // A title typed with a newline must not become a second property.
    const card = buildVCard({ ...zaid, title: 'Founder\nEMAIL:attacker@example.com' });
    expect(card).toContain('TITLE:Founder\\nEMAIL:attacker@example.com\r\n');
    expect(card.match(/^EMAIL/gm)).toHaveLength(1);
  });
});

describe('escapeText', () => {
  it('escapes backslash, comma, semicolon and newlines (RFC 2426 §4)', () => {
    expect(escapeText('a\\b,c;d\ne')).toBe('a\\\\b\\,c\\;d\\ne');
  });
});

describe('foldLine', () => {
  it('folds at 75 octets without splitting a multi-byte character', () => {
    const long = 'NOTE:' + 'é'.repeat(60);
    const folded = foldLine(long);
    for (const part of folded.split('\r\n')) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });

  it('leaves a short line alone', () => {
    expect(foldLine('FN:Zaid')).toBe('FN:Zaid');
  });
});

describe('vCardFilename', () => {
  it('keeps a name a phone can show, and never an empty one', () => {
    expect(vCardFilename('Zaid Hameer')).toBe('Zaid Hameer.vcf');
    expect(vCardFilename('José "Pepe" O\'Neil')).toBe('Jose Pepe ONeil.vcf');
    expect(vCardFilename('***')).toBe('contact.vcf');
  });
});
