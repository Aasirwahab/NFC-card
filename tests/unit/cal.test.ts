import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readCalWebhook } from '@/lib/booking/cal';
import { parseBookingUrl } from '@/lib/booking/link';
import { verifyCalSignature } from '@/lib/booking/signature';

/**
 * Booking (§19.1): the link, the signature, and reading the webhook.
 */

const SESSION = '11111111-1111-4111-8111-111111111111';

describe('parseBookingUrl', () => {
  it('splits a Cal.com link into the origin and the path the embed takes', () => {
    expect(parseBookingUrl('https://cal.com/zaid/15min')).toEqual({
      calOrigin: 'https://cal.com',
      calLink: 'zaid/15min',
    });
    expect(parseBookingUrl('https://book.tma.example/zaid/')).toEqual({
      calOrigin: 'https://book.tma.example',
      calLink: 'zaid',
    });
  });

  it('refuses anything that is not a plain https link with a path', () => {
    for (const bad of [
      '',
      null,
      'cal.com/zaid',
      'http://cal.com/zaid',
      'javascript:alert(1)',
      'https://cal.com/',
      'https://user:pass@cal.com/zaid',
    ]) {
      expect(parseBookingUrl(bad), String(bad)).toBeNull();
    }
  });

  it('keeps only the path, so nothing in a query string reaches the embed', () => {
    expect(parseBookingUrl('https://cal.com/zaid?x=<script>#frag')).toEqual({
      calOrigin: 'https://cal.com',
      calLink: 'zaid',
    });
  });
});

describe('verifyCalSignature', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ triggerEvent: 'BOOKING_CREATED' });
  const good = createHmac('sha256', secret).update(body).digest('hex');

  it('accepts the HMAC-SHA256 of the raw body', () => {
    expect(verifyCalSignature(body, good, secret)).toBe(true);
  });

  it('rejects a wrong, missing, malformed or re-serialised signature', () => {
    expect(
      verifyCalSignature(body, good.replace(/.$/, good.endsWith('0') ? '1' : '0'), secret),
    ).toBe(false);
    expect(verifyCalSignature(body, null, secret)).toBe(false);
    expect(verifyCalSignature(body, 'not-hex', secret)).toBe(false);
    expect(verifyCalSignature(body + ' ', good, secret)).toBe(false);
    expect(verifyCalSignature(body, good, 'another-secret')).toBe(false);
  });
});

describe('readCalWebhook', () => {
  const created = {
    triggerEvent: 'BOOKING_CREATED',
    createdAt: '2026-09-22T18:47:00Z',
    payload: {
      uid: 'bk_1',
      startTime: '2026-09-24T10:00:00Z',
      attendees: [{ email: 'tom@buildrite.example', name: 'Tom Hargreaves' }],
      metadata: { session_id: SESSION, videoCallUrl: 'https://cal.video/x' },
    },
  };

  it('reads a new booking and links it to the session from the metadata', () => {
    expect(readCalWebhook(created)).toEqual({
      uid: 'bk_1',
      status: 'confirmed',
      sessionId: SESSION,
      startsAt: '2026-09-24T10:00:00Z',
      email: 'tom@buildrite.example',
      name: 'Tom Hargreaves',
      rescheduledFrom: null,
    });
  });

  it('keeps a booking whose metadata is missing or not a session id, unlinked', () => {
    expect(
      readCalWebhook({ ...created, payload: { ...created.payload, metadata: null } })?.sessionId,
    ).toBeNull();
    expect(
      readCalWebhook({
        ...created,
        payload: { ...created.payload, metadata: { session_id: "x' or 1=1" } },
      })?.sessionId,
    ).toBeNull();
  });

  it('marks a cancellation, and links a reschedule to the booking it replaces', () => {
    expect(readCalWebhook({ ...created, triggerEvent: 'BOOKING_CANCELLED' })?.status).toBe(
      'cancelled',
    );
    expect(
      readCalWebhook({
        ...created,
        triggerEvent: 'BOOKING_RESCHEDULED',
        payload: { ...created.payload, uid: 'bk_2', rescheduleUid: 'bk_1' },
      }),
    ).toMatchObject({ uid: 'bk_2', status: 'confirmed', rescheduledFrom: 'bk_1' });
  });

  it('ignores events this product does not track, and unreadable bodies', () => {
    expect(readCalWebhook({ ...created, triggerEvent: 'MEETING_STARTED' })).toBeNull();
    expect(readCalWebhook({ triggerEvent: 'BOOKING_CREATED' })).toBeNull();
    expect(readCalWebhook('nonsense')).toBeNull();
  });
});
