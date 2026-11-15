import { describe, expect, it } from 'vitest';
import { requestReplyLink } from '@/lib/followup/send';

const input = {
  channel: 'text' as const,
  contact: '07700 900123',
  prospectName: 'Tom Smith',
  repFullName: 'Sam Jones',
  businessName: 'Example & Co',
  eventName: 'Business Expo',
  pageUrl: 'https://example.com/c/ABCDEFGH',
};
const body =
  "Hi Tom, it's Sam from Example & Co. You asked me to send the details from our chat at Business Expo: https://example.com/c/ABCDEFGH. Reply stop and I won't message again.";

describe('consent-bound request reply links', () => {
  it('opens the normalised Call recipient without a message', () => {
    expect(requestReplyLink({ ...input, channel: 'call' })).toEqual({
      href: 'tel:+447700900123',
      label: 'Call +447700900123',
    });
  });

  it('opens Text with the fixed, encoded body and visible recipient', () => {
    expect(requestReplyLink(input)).toEqual({
      href: `sms:+447700900123?body=${encodeURIComponent(body)}`,
      label: 'Text +447700900123',
    });
  });

  it('opens WhatsApp with digits only and the same fixed body', () => {
    expect(requestReplyLink({ ...input, channel: 'whatsapp' })).toEqual({
      href: `https://wa.me/447700900123?text=${encodeURIComponent(body)}`,
      label: 'WhatsApp +447700900123',
    });
  });

  it('opens Email with the lower-cased, encoded recipient and fixed body', () => {
    expect(
      requestReplyLink({ ...input, channel: 'email', contact: 'Tom+Expo@Example.com' }),
    ).toEqual({
      href: `mailto:tom%2Bexpo%40example.com?body=${encodeURIComponent(body)}`,
      label: 'Email tom+expo@example.com',
    });
  });

  it.each(['call', 'text', 'whatsapp'] as const)(
    'refuses hostile or non-UK mobile recipients for %s',
    (channel) => {
      for (const contact of [
        '+447700900123?body=bad',
        '+447700900123&bcc=other',
        '+447700900123\r\n',
        '+447700900123;123',
        '+447700900123,123',
        '+14155552671',
        '020 7946 0123',
        'tom@example.com',
        'javascript:alert(1)',
      ]) {
        expect(requestReplyLink({ ...input, channel, contact })).toBeNull();
      }
    },
  );

  it.each([
    'tom@example.com?bcc=other@example.com',
    'tom@example.com\r\nBcc:other@example.com',
    'tom@example.com,other@example.com',
    'tom@example.com;other@example.com',
    '07700900123',
  ])('refuses unsafe Email recipients: %s', (contact) => {
    expect(requestReplyLink({ ...input, channel: 'email', contact })).toBeNull();
  });

  it.each([
    'javascript:alert(1)',
    'data:text/plain,bad',
    '//example.com/c/ABCDEFGH',
    'https://user:password@example.com/c/ABCDEFGH',
    'https://example.com\\@evil.example/c/ABCDEFGH',
    'https://example.com/c/ABCDEFGH\r\nBcc:bad@example.com',
    'https://',
  ])('refuses unsafe page URLs: %s', (pageUrl) => {
    expect(requestReplyLink({ ...input, pageUrl })).toBeNull();
  });

  it('keeps punctuation and URL query parts inside the encoded body', () => {
    const reply = requestReplyLink({
      ...input,
      channel: 'email',
      contact: 'tom@example.com',
      prospectName: 'Tom&bcc=attacker@example.com Smith',
      repFullName: 'Sam?subject=bad Jones',
      businessName: 'Example & Co ?bcc=other@example.com',
      eventName: 'Expo #1 & today',
      pageUrl: 'https://example.com/c/ABCDEFGH?from=expo&value=%26bcc%3Dbad#details',
    });
    expect(reply).not.toBeNull();
    const params = new URLSearchParams(reply!.href.split('?')[1]);
    expect([...params.keys()]).toEqual(['body']);
    expect(params.get('body')).toBe(
      "Hi Tom&bcc=attacker@example.com, it's Sam?subject=bad from Example & Co ?bcc=other@example.com. You asked me to send the details from our chat at Expo #1 & today: https://example.com/c/ABCDEFGH?from=expo&value=%26bcc%3Dbad#details. Reply stop and I won't message again.",
    );
  });

  it.each(['prospectName', 'repFullName', 'businessName', 'eventName'] as const)(
    'rejects control and malformed characters in %s',
    (field) => {
      for (const value of ['Tom\r\nBcc:other@example.com', 'Tom\u202eevil', 'Tom\ud800']) {
        expect(requestReplyLink({ ...input, [field]: value })).toBeNull();
      }
    },
  );

  it('uses neutral fixed fallbacks for missing names, business and event', () => {
    const reply = requestReplyLink({
      ...input,
      prospectName: null,
      repFullName: '',
      businessName: null,
      eventName: null,
    });
    expect(decodeURIComponent(reply!.href.split('?body=')[1]!)).toBe(
      "Hi there, it's the team from our business. You asked me to send the details from our chat at the event: https://example.com/c/ABCDEFGH. Reply stop and I won't message again.",
    );
  });
});
