import { describe, expect, it } from 'vitest';
import { pitchEmail } from '@/lib/email/pitch-email';

/**
 * "Email me this page" (§19.2).
 */

const input = {
  prospectName: 'Tom Hargreaves',
  repFullName: 'Zaid Hameer',
  repTitle: 'Founder',
  businessName: 'TMA',
  pitch: 'It was good to meet you.\n\nBook a time below if it is useful.',
  pageUrl: 'https://taplead.app/c/K7M3PQ2X',
};

describe('pitchEmail', () => {
  const email = pitchEmail(input);

  it('reads like the page: greeting, the pitch, and a way back', () => {
    expect(email.subject).toBe('Your note from Zaid');
    expect(email.text).toMatch(/^Hi Tom,\n\nIt was good to meet you\.\n\nBook a time below/);
    expect(email.text).toContain('https://taplead.app/c/K7M3PQ2X');
    expect(email.text).toContain('Zaid Hameer · Founder · TMA');
  });

  it('keeps paragraphs as paragraphs in HTML', () => {
    expect(email.html).toContain('<p>It was good to meet you.</p>');
    expect(email.html).toContain('<p>Book a time below if it is useful.</p>');
  });

  it('escapes HTML in anything the rep or prospect typed', () => {
    const risky = pitchEmail({ ...input, pitch: '<script>alert(1)</script>', repTitle: '"><b>' });
    expect(risky.html).not.toContain('<script>');
    expect(risky.html).not.toContain('"><b>');
  });

  it('has no tracking pixel or remote image', () => {
    expect(email.html).not.toMatch(/<img/i);
  });

  it('greets plainly when the name is unknown', () => {
    expect(pitchEmail({ ...input, prospectName: null }).text.startsWith('Hi,\n')).toBe(true);
  });
});
