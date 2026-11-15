import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { DEFAULT_CONTACT_FORM } from '@/lib/domain/contact-form';
import { POST, GET } from '@/app/api/landing/[code]/answers/route';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  after: vi.fn(),
  kick: vi.fn(),
  userId: null as string | null,
  ownerCookie: false,
  tokenCookie: null as string | null,
  tokenHash: null as string | null,
  setCookie: vi.fn(),
  staff: false,
  details: null as string | null,
  email: 'bella@example.test' as string | null,
  form: null as unknown,
  profileError: false,
  answers: [{ label: 'What would you like from Sam?', value: 'A quick call' }],
  firstViewed: '2026-11-13T10:00:00Z',
  choices: ['Problem A', 'Problem B'],
  update: vi.fn(),
  filters: vi.fn(),
  rate: vi.fn(),
  race: false,
  missing: false,
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: (fn: unknown) => mocks.after(fn),
}));
vi.mock('@/lib/jobs/kick', () => ({ kickWorkers: () => mocks.kick() }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) =>
      name === 'prospect_answers'
        ? mocks.tokenCookie
          ? { value: mocks.tokenCookie }
          : undefined
        : mocks.ownerCookie
          ? { value: 'owner' }
          : undefined,
    set: (...args: unknown[]) => mocks.setCookie(...args),
  }),
}));
vi.mock('@/lib/db/server', () => ({
  getRep: async () => (mocks.userId ? { userId: mocks.userId } : null),
}));
vi.mock('@/lib/auth/staff', () => ({
  getStaff: async () => (mocks.staff ? { userId: mocks.userId } : null),
}));
vi.mock('@/lib/capture/prospect-problems', () => ({
  getProspectProblems: async () => mocks.choices,
}));
vi.mock('@/lib/security/rate-limit', () => ({
  clientIp: () => 'ip',
  checkRateLimit: (...args: unknown[]) => mocks.rate(...args),
  peekRateLimit: async () => true,
}));
vi.mock('@/lib/db/service', () => ({
  serviceClient: () => ({
    from: (table: string) => {
      let updating = false;
      return {
        insert: (...args: unknown[]) => mocks.insert(...args),
        select() {
          return this;
        },
        update(value: unknown) {
          updating = true;
          mocks.update(value);
          return this;
        },
        eq(...args: unknown[]) {
          mocks.filters(...args);
          return this;
        },
        is(...args: unknown[]) {
          mocks.filters(...args);
          return this;
        },
        maybeSingle: async () => ({
          data: updating
            ? mocks.race
              ? null
              : { id: 'session' }
            : table === 'cards'
              ? mocks.missing
                ? null
                : { id: 'card', user_id: 'owner' }
              : table === 'profiles'
                ? { contact_form: mocks.form, full_name: 'Sam Smith' }
                : {
                    id: 'session',
                    user_id: 'owner',
                    event_id: 'event',
                    details_completed_at: mocks.details,
                    first_viewed_at: mocks.firstViewed,
                    prospect_answer_token_hash: mocks.tokenHash,
                    prospect_picked_problems: ['Problem A'],
                    prospect_form_answers: mocks.answers,
                    prospect_submitted_email: mocks.email,
                    prospect_submitted_phone: mocks.email ? null : '+447700900123',
                  },
          error: table === 'profiles' && mocks.profileError ? { message: 'offline' } : null,
        }),
      };
    },
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
  mocks.insert.mockResolvedValue({ error: null });
  mocks.userId = null;
  mocks.ownerCookie = false;
  mocks.tokenCookie = null;
  mocks.tokenHash = null;
  mocks.staff = false;
  mocks.details = null;
  mocks.email = 'bella@example.test';
  mocks.firstViewed = '2026-11-13T10:00:00Z';
  mocks.race = false;
  mocks.missing = false;
  mocks.form = null;
  mocks.profileError = false;
  mocks.rate.mockResolvedValue({ allowed: true });
});
const submit = (body: unknown) =>
  POST(
    new Request('https://example.com/api/landing/ABCDEFGH/answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ code: 'ABCDEFGH' }) },
  );

describe('prospect answer writes', () => {
  it('queues a contact alert with no prospect data and kicks after the response', async () => {
    expect((await submit({ contact: 'a@example.com', consent: true })).status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith({
      type: 'notify_contact',
      session_id: 'session',
      user_id: 'owner',
    });
    expect(mocks.kick).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0]![0]();
    expect(mocks.kick).toHaveBeenCalledOnce();
  });
  it('leaves an existing live alert untouched and accepts the save', async () => {
    mocks.insert.mockResolvedValue({
      error: {
        code: '23505',
        message: 'duplicate key violates unique constraint "jobs_one_live_per_session"',
      },
    });
    expect((await submit({ contact: 'a@example.com', consent: true })).status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.after).toHaveBeenCalledOnce();
  });
  it('never queues for problem picks or a failed contact save', async () => {
    expect((await submit({ problems: [] })).status).toBe(200);
    mocks.race = true;
    expect((await submit({ contact: 'a@example.com', consent: true })).status).toBe(409);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it('still saves when the rep alert cannot be queued, and alerts without prospect data', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.insert.mockResolvedValue({ error: { code: '08006', message: 'private data' } });
    expect((await submit({ contact: 'a@example.com', consent: true })).status).toBe(200);
    expect(JSON.stringify(log.mock.calls)).toContain('contact_alert_enqueue_failed');
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private data|a@example.com/);
    log.mockRestore();
  });

  it('saves valid chips alone with an atomic unsaved and active guard', async () => {
    expect((await submit({ problems: ['Problem A'] })).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      prospect_picked_problems: ['Problem A'],
      prospect_answer_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(mocks.filters).toHaveBeenCalledWith('details_completed_at', null);
    expect(mocks.filters).toHaveBeenCalledWith('status', 'active');
    expect(mocks.rate).toHaveBeenCalledWith('prospectAnswers', 'ip:ip');
    expect(mocks.rate).toHaveBeenCalledWith('prospectAnswers', 'card:ABCDEFGH');
  });
  it('stores only a normalised contact and server consent timestamp', async () => {
    expect((await submit({ contact: ' A@EXAMPLE.COM ', consent: true })).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      prospect_submitted_email: 'a@example.com',
      prospect_submitted_phone: null,
      prospect_form_answers: null,
      prospect_consent_at: '2026-11-13T12:00:00.000Z',
      prospect_answer_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
  it.each([
    ['  A quote please  ', 'A quote please'],
    ['   ', null],
    ['x'.repeat(300), 'x'.repeat(300)],
  ])('saves a trimmed optional message: %s', async (message, expected) => {
    expect(
      (await submit({ contact: 'a@example.com', consent: true, answers: { message } })).status,
    ).toBe(200);
    expect(mocks.update.mock.calls[0]![0].prospect_form_answers).toEqual(
      expected ? [{ label: 'What would you like from Sam?', value: expected }] : null,
    );
  });
  it('rejects overlong messages and messages without a consenting contact', async () => {
    for (const body of [
      { contact: 'a@example.com', consent: true, answers: { message: 'x'.repeat(301) } },
      { answers: { message: 'A call' } },
      { problems: [], answers: { message: 'A call' } },
      { contact: 'a@example.com', answers: { message: 'A call' } },
    ])
      expect((await submit(body)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('clears a previous message when correcting contact without one', async () => {
    mocks.tokenCookie = 'first-browser';
    mocks.tokenHash = createHash('sha256').update('first-browser').digest('hex');
    expect((await submit({ contact: 'fixed@example.com', consent: true })).status).toBe(200);
    expect(mocks.update.mock.calls[0]![0].prospect_form_answers).toBeNull();
  });
  it('validates the rep config, rejecting missing required, unknown and invalid choice answers', async () => {
    mocks.form = {
      ...DEFAULT_CONTACT_FORM,
      fields: { ...DEFAULT_CONTACT_FORM.fields, name: { ask: true, required: true } },
      questions: [
        { id: 'when', label: 'When?', type: 'choice', options: ['Now', 'Later'], required: true },
      ],
    };
    for (const answers of [
      {},
      { name: 'Alex', 'question:when': 'Never' },
      { name: 'Alex', 'question:when': 'Now', injected: 'x' },
    ]) {
      expect((await submit({ contact: 'a@example.com', consent: true, answers })).status).toBe(400);
    }
    expect(mocks.update).not.toHaveBeenCalled();
    expect(
      (
        await submit({
          contact: 'a@example.com',
          consent: true,
          answers: { name: ' Alex ', 'question:when': 'Now' },
        })
      ).status,
    ).toBe(200);
    expect(mocks.update.mock.calls[0]![0].prospect_form_answers).toEqual([
      { label: 'Name', value: 'Alex' },
      { label: 'When?', value: 'Now' },
    ]);
  });
  it('rejects hidden forms while retaining problem answers, and handles profile read errors', async () => {
    mocks.form = { ...DEFAULT_CONTACT_FORM, enabled: false };
    expect((await submit({ contact: 'a@example.com', consent: true })).status).toBe(400);
    expect((await submit({ problems: [] })).status).toBe(200);
    mocks.profileError = true;
    expect((await submit({ contact: 'a@example.com', consent: true })).status).toBe(503);
  });
  it('sets a secure, route-scoped cookie and stores only its hash on the first answer', async () => {
    expect((await submit({ problems: [] })).status).toBe(200);
    const [name, token, options] = mocks.setCookie.mock.calls[0]!;
    expect(name).toBe('prospect_answers');
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/landing/ABCDEFGH/answers',
      maxAge: 86400,
    });
    expect(mocks.update.mock.calls[0]![0].prospect_answer_token_hash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(mocks.filters).toHaveBeenCalledWith('prospect_answer_token_hash', null);
  });
  it('refuses another browser and returns only read-only state without choices', async () => {
    mocks.tokenHash = createHash('sha256').update('first-browser').digest('hex');
    const response = await submit({ contact: 'other@example.com', consent: true });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'answers_given' });
    expect(mocks.update).not.toHaveBeenCalled();
    const read = await GET(new Request('https://example.com'), {
      params: Promise.resolve({ code: 'ABCDEFGH' }),
    });
    expect(await read.json()).toEqual({ picked: [], contact: null, answers: null, readOnly: true });
  });
  it('lets the same browser correct its contact without replacing the token', async () => {
    mocks.tokenCookie = 'first-browser';
    mocks.tokenHash = createHash('sha256').update('first-browser').digest('hex');
    expect((await submit({ contact: 'fixed@example.com', consent: true })).status).toBe(200);
    expect(mocks.update.mock.calls[0]![0]).toMatchObject({
      prospect_submitted_email: 'fixed@example.com',
    });
    expect(mocks.filters).toHaveBeenCalledWith('prospect_answer_token_hash', mocks.tokenHash);
    expect(mocks.setCookie).not.toHaveBeenCalled();
    const read = await GET(new Request('https://example.com'), {
      params: Promise.resolve({ code: 'ABCDEFGH' }),
    });
    expect(await read.json()).toEqual({
      picked: ['Problem A'],
      contact: 'b•••@example.test',
      answers: mocks.answers,
      readOnly: false,
    });
  });
  it('masks a mobile number for the answering browser and shows no browser without the token', async () => {
    mocks.email = null;
    mocks.tokenCookie = 'first-browser';
    mocks.tokenHash = createHash('sha256').update('first-browser').digest('hex');
    const read = () =>
      GET(new Request('https://example.com'), { params: Promise.resolve({ code: 'ABCDEFGH' }) });
    expect((await (await read()).json()).contact).toBe('•••• ••• 23');
    mocks.tokenCookie = null;
    const other = JSON.stringify(await (await read()).json());
    expect(other).not.toMatch(/23|example/);
  });
  it('rejects a problem outside this contact event list', async () => {
    expect((await submit({ problems: ['Injected topic'] })).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('refuses the signed-in owner, signed-out owner device and staff', async () => {
    mocks.userId = 'owner';
    expect((await submit({ problems: [] })).status).toBe(403);
    mocks.userId = null;
    mocks.ownerCookie = true;
    expect((await submit({ problems: [] })).status).toBe(403);
    mocks.ownerCookie = false;
    mocks.userId = 'staff';
    mocks.staff = true;
    expect((await submit({ problems: [] })).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('allows a different signed-in rep who is not staff', async () => {
    mocks.userId = 'another-rep';
    expect((await submit({ problems: [] })).status).toBe(200);
  });
  it('refuses saved, expired, and concurrently saved contacts with 409', async () => {
    mocks.details = '2026-11-13T11:00:00Z';
    expect((await submit({ problems: [] })).status).toBe(409);
    mocks.details = null;
    mocks.firstViewed = '2026-11-12T12:00:00Z';
    expect((await submit({ problems: [] })).status).toBe(409);
    mocks.firstViewed = '2026-11-13T10:00:00Z';
    mocks.race = true;
    expect((await submit({ problems: [] })).status).toBe(409);
  });
  it('rejects invalid input before writing and rate limits per card', async () => {
    expect((await submit({ contact: 'a@example.com', consent: false })).status).toBe(400);
    mocks.rate.mockImplementation(async (_name, key) => ({ allowed: key !== 'card:ABCDEFGH' }));
    expect((await submit({ problems: [] })).status).toBe(429);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('limits contact saves per card with 429, but not problem picks', async () => {
    mocks.rate.mockImplementation(async (name) => ({ allowed: name !== 'prospectContact' }));
    const limited = await submit({ contact: 'a@example.com', consent: true });
    expect(limited.status).toBe(429);
    expect(mocks.rate).toHaveBeenCalledWith('prospectContact', 'card:ABCDEFGH');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    mocks.rate.mockClear();
    expect((await submit({ problems: ['Problem A'] })).status).toBe(200);
    expect(mocks.rate).not.toHaveBeenCalledWith('prospectContact', expect.anything());
  });
});
