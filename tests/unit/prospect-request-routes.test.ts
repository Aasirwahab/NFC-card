import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, POST } from '@/app/api/landing/[code]/answers/request/route';
import { POST as done } from '@/app/api/sessions/[id]/requests/[requestId]/done/route';
import { REQUEST_CONSENT_VERSION } from '@/lib/domain/prospect-requests';

const mocks = vi.hoisted(() => ({
  rep: null as { userId: string } | null,
  staff: false,
  ownerCookie: false,
  answerCookie: undefined as string | undefined,
  requestCookie: undefined as string | undefined,
  answerHash: null as string | null,
  setCookie: vi.fn(),
  rpc: vi.fn(),
  rate: vi.fn(),
  filters: vi.fn(),
  update: vi.fn(),
  details: '2026-11-14T09:00:00Z' as string | null,
  firstViewed: '2026-11-14T08:00:00Z',
  storedRequest: null as Record<string, unknown> | null,
  missing: false,
  dbError: false,
  cancelRace: false,
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => {
      const value =
        name === 'prospect_answers'
          ? mocks.answerCookie
          : name === 'prospect_requests'
            ? mocks.requestCookie
            : mocks.ownerCookie
              ? 'owner'
              : undefined;
      return value ? { value } : undefined;
    },
    set: (...args: unknown[]) => mocks.setCookie(...args),
  }),
}));
vi.mock('@/lib/db/server', () => ({ getRep: async () => mocks.rep }));
vi.mock('@/lib/auth/staff', () => ({
  getStaff: async () => (mocks.staff ? { userId: 'staff' } : null),
}));
vi.mock('@/lib/security/rate-limit', () => ({
  clientIp: () => 'ip',
  checkRateLimit: (...args: unknown[]) => mocks.rate(...args),
  peekRateLimit: async () => true,
}));
vi.mock('@/lib/db/service', () => ({
  serviceClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      let updating = false;
      const query = {
        select: () => query,
        update: (value: unknown) => {
          updating = true;
          mocks.update(value);
          return query;
        },
        eq: (...args: unknown[]) => {
          mocks.filters(...args);
          return query;
        },
        maybeSingle: async () => ({
          data:
            updating && mocks.cancelRace
              ? null
              : table === 'cards'
                ? mocks.missing
                  ? null
                  : { id: 'card', user_id: 'owner' }
                : table === 'sessions'
                  ? {
                      id: 'session',
                      user_id: 'owner',
                      details_completed_at: mocks.details,
                      first_viewed_at: mocks.firstViewed,
                      prospect_answer_token_hash: mocks.answerHash,
                      prospect_submitted_email: 'private@example.com',
                      prospect_submitted_phone: '+447700900123',
                    }
                  : mocks.storedRequest,
          error: mocks.dbError ? { message: 'offline' } : null,
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return query;
    },
  }),
}));
const id = '9e9093b1-3701-4780-a925-2df66149d981';
const requestId = 'f84419a5-fd78-4bb2-81cd-ffb9ae85c52c';
const context = { params: Promise.resolve({ code: 'ABCDEFGH' }) };
const endpoint = 'https://example.com/api/landing/ABCDEFGH/answers/request';
const body = {
  kind: 'details',
  channel: 'text',
  contact: '07700 900123',
  consent: true,
  bestTime: 'today',
};
const publicRow = {
  id: requestId,
  kind: 'details',
  channel: 'text',
  best_time: 'today',
  status: 'open',
};
const req = (method = 'GET', value?: unknown) =>
  new Request(endpoint, {
    method,
    ...(method === 'GET'
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rep = null;
  mocks.staff = false;
  mocks.ownerCookie = false;
  mocks.answerCookie = undefined;
  mocks.requestCookie = undefined;
  mocks.answerHash = null;
  mocks.details = '2026-11-14T09:00:00Z';
  mocks.firstViewed = new Date(Date.now() - 1000).toISOString();
  mocks.storedRequest = null;
  mocks.missing = false;
  mocks.dbError = false;
  mocks.cancelRace = false;
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.rpc.mockResolvedValue({ data: publicRow, error: null });
});

describe('public request trust boundary', () => {
  it('captures server consent version and normalised recipient with only a token hash stored', async () => {
    const response = await POST(req('POST', body), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ request: publicRow, contact: null });
    expect(mocks.rpc).toHaveBeenCalledWith('replace_prospect_request', {
      p_session_id: 'session',
      p_kind: 'details',
      p_channel: 'text',
      p_contact_value: '+447700900123',
      p_best_time: 'today',
      p_consent_version: REQUEST_CONSENT_VERSION,
      p_requester_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_answer_token_hash: null,
    });
    const [name, token, options] = mocks.setCookie.mock.calls[0]!;
    expect(name).toBe('prospect_requests');
    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/landing/ABCDEFGH/answers/request',
    });
    expect(mocks.rpc.mock.calls[0]![1].p_requester_token_hash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(mocks.rate).toHaveBeenCalledWith('prospectAnswers', 'ip:ip');
    expect(mocks.rate).toHaveBeenCalledWith('prospectAnswers', 'card:ABCDEFGH');
  });
  it('lowercases email and refuses mismatched channel, free text, missing or false consent', async () => {
    expect(
      (await POST(req('POST', { ...body, channel: 'email', contact: ' A@EXAMPLE.COM ' }), context))
        .status,
    ).toBe(200);
    expect(mocks.rpc.mock.calls[0]![1].p_contact_value).toBe('a@example.com');
    mocks.rpc.mockClear();
    for (const invalid of [
      { ...body, consent: undefined },
      { ...body, consent: false },
      { ...body, contact: 'a@example.com' },
      { ...body, note: 'Call me' },
    ]) {
      expect((await POST(req('POST', invalid), context)).status).toBe(400);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('returns holding contact prefill only to the browser with the answer token, including the finished note', async () => {
    expect(await (await GET(req(), context)).json()).toEqual({ request: null, contact: null });
    mocks.answerCookie = 'holding-answer';
    mocks.answerHash = createHash('sha256').update(mocks.answerCookie).digest('hex');
    const response = await GET(req(), context);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      request: null,
      contact: { email: 'private@example.com', phone: '+447700900123' },
    });
    mocks.answerCookie = 'someone-else';
    expect(await (await GET(req(), context)).json()).toEqual({ request: null, contact: null });
  });
  it('returns only the owning browser’s open request without recipient or token data', async () => {
    mocks.requestCookie = 'browser';
    mocks.storedRequest = {
      ...publicRow,
      contact_value: 'private@example.com',
      requester_token_hash: 'secret-hash',
    };
    expect(await (await GET(req(), context)).json()).toEqual({ request: publicRow, contact: null });
    expect(mocks.filters).toHaveBeenCalledWith(
      'requester_token_hash',
      createHash('sha256').update('browser').digest('hex'),
    );
    expect(mocks.filters).toHaveBeenCalledWith('status', 'open');
  });
  it('cancels only the owned open request and validates the identifier', async () => {
    mocks.requestCookie = 'browser';
    mocks.storedRequest = publicRow;
    expect((await DELETE(req('DELETE', { requestId: 'other' }), context)).status).toBe(400);
    expect((await DELETE(req('DELETE', { requestId: id }), context)).status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
    const response = await DELETE(req('DELETE', { requestId }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ request: null, contact: null });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ status: 'withdrawn' });
    expect(mocks.filters).toHaveBeenCalledWith('session_id', 'session');
  });
  it('does not claim withdrawal if Done or replacement won after the read', async () => {
    mocks.requestCookie = 'browser';
    mocks.storedRequest = publicRow;
    mocks.cancelRace = true;
    const response = await DELETE(req('DELETE', { requestId }), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'request_changed' });
  });
  it('refuses owner preview, owner device and staff; allows another signed-in nonstaff rep', async () => {
    mocks.rep = { userId: 'owner' };
    expect((await POST(req('POST', body), context)).status).toBe(403);
    mocks.rep = null;
    mocks.ownerCookie = true;
    expect((await POST(req('POST', body), context)).status).toBe(403);
    mocks.ownerCookie = false;
    mocks.rep = { userId: 'staff' };
    mocks.staff = true;
    expect((await POST(req('POST', body), context)).status).toBe(403);
    mocks.staff = false;
    expect((await POST(req('POST', body), context)).status).toBe(200);
  });
  it('rejects stale holding writes, while allowing cancellation after holding expires', async () => {
    mocks.details = null;
    expect((await POST(req('POST', body), context)).status).toBe(200);
    mocks.firstViewed = '2020-01-01';
    expect((await POST(req('POST', body), context)).status).toBe(409);
    mocks.requestCookie = 'browser';
    mocks.storedRequest = publicRow;
    expect((await DELETE(req('DELETE', { requestId }), context)).status).toBe(200);
  });
  it('maps concurrent replacement refusals and does not set a cookie for a failed write', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'request_given' } });
    expect((await POST(req('POST', body), context)).status).toBe(409);
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
  it('handles rate limits, unknown codes and database failure without writes', async () => {
    mocks.rate.mockResolvedValue({ allowed: false });
    expect((await POST(req('POST', body), context)).status).toBe(429);
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.missing = true;
    expect((await POST(req('POST', body), context)).status).toBe(404);
    mocks.missing = false;
    mocks.dbError = true;
    expect((await POST(req('POST', body), context)).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('rep Done ownership', () => {
  const doneContext = { params: Promise.resolve({ id, requestId }) };
  it('requires a signed-in rep', async () => {
    expect((await done(req('POST'), doneContext)).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('passes the authenticated identity to the atomic ownership check', async () => {
    mocks.rep = { userId: 'owner' };
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect((await done(req('POST'), doneContext)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('mark_prospect_request_done', {
      p_session_id: id,
      p_request_id: requestId,
      p_user_id: 'owner',
    });
  });
  it('returns 404 for a wrong owner or invalid UUID without allowing a write', async () => {
    mocks.rep = { userId: 'other' };
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await done(req('POST'), doneContext)).status).toBe(404);
    mocks.rpc.mockClear();
    expect(
      (await done(req('POST'), { params: Promise.resolve({ id: 'invalid', requestId }) })).status,
    ).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
