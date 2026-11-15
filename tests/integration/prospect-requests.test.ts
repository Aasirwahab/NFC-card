import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, seedFixture, type TestDb } from './harness';
import type { Database } from '@/lib/db/types';

// History makes this a one-to-many relationship despite the partial open-row index.
const requestRelationshipIsOneToOne: Database['public']['Tables']['prospect_requests']['Relationships'][0]['isOneToOne'] = false;

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});
const tokenHash = 'a'.repeat(64);

async function contact() {
  const fixture = await seedFixture(db, { cards: 1 });
  const sessionId = crypto.randomUUID();
  await db.query(`select * from public.register_card($1, $2, $3, $4, 'Rep', null)`, [
    sessionId,
    fixture.codes[0],
    fixture.eventId,
    fixture.userId,
  ]);
  await db.query(`update public.sessions set first_viewed_at = now() where id = $1`, [sessionId]);
  return { ...fixture, sessionId };
}
async function request(sessionId: string, requester = tokenHash, answer: string | null = null) {
  return (
    await db.query<{ id: string }>(
      `select * from public.replace_prospect_request($1, 'details', 'text', '+447700900123', 'today', '2026-11-14-v1', $2, $3)`,
      [sessionId, requester, answer],
    )
  ).rows[0]!;
}

describe('prospect request storage and privacy', () => {
  it('generates a one-to-many relationship for request history', () => {
    expect(requestRelationshipIsOneToOne).toBe(false);
  });
  it('captures the single-contact consent and timestamp and replaces only an open request', async () => {
    const { sessionId, userId } = await contact();
    const first = await request(sessionId);
    const next = await request(sessionId);
    const rows = (
      await db.query<{ id: string; status: string; consent_at: Date; consent_version: string }>(
        'select id, status, consent_at, consent_version from public.prospect_requests where session_id = $1 order by created_at',
        [sessionId],
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === first.id)?.status).toBe('withdrawn');
    expect(rows.find((row) => row.id === next.id)?.status).toBe('open');
    expect(rows.every((row) => row.consent_version === '2026-11-14-v1' && row.consent_at)).toBe(
      true,
    );
    expect(
      (
        await db.query('select public.mark_prospect_request_done($1, $2, $3) as done', [
          sessionId,
          next.id,
          userId,
        ])
      ).rows,
    ).toEqual([{ done: true }]);
    await request(sessionId);
    expect(
      (
        await db.query('select status, done_at from public.prospect_requests where id = $1', [
          next.id,
        ])
      ).rows[0],
    ).toMatchObject({ status: 'done', done_at: expect.any(Date) });
  });
  it('enforces one open row even for concurrent replacement and rejects direct duplicates', async () => {
    const { sessionId } = await contact();
    await Promise.all([request(sessionId), request(sessionId), request(sessionId)]);
    expect(
      (
        await db.query(
          "select id from public.prospect_requests where session_id = $1 and status = 'open'",
          [sessionId],
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      db.query(
        `insert into public.prospect_requests(session_id, kind, channel, contact_value, consent_version, requester_token_hash)
      values ($1, 'call', 'call', '+447700900123', '2026-11-14-v1', $2)`,
        [sessionId, tokenHash],
      ),
    ).rejects.toThrow(/duplicate key/);
  });
  it('refuses replacement by another browser unless it holds the original answer token', async () => {
    const { sessionId } = await contact();
    await request(sessionId);
    await expect(request(sessionId, 'b'.repeat(64))).rejects.toThrow(/request_given/);
    await db.query('update public.sessions set prospect_answer_token_hash = $2 where id = $1', [
      sessionId,
      'answer-hash',
    ]);
    await request(sessionId, 'b'.repeat(64), 'answer-hash');
    expect(
      (
        await db.query(
          "select requester_token_hash from public.prospect_requests where session_id = $1 and status = 'open'",
          [sessionId],
        )
      ).rows,
    ).toEqual([{ requester_token_hash: 'b'.repeat(64) }]);
  });
  it('enforces ownership and timestamps Done once, marking follow-up sent', async () => {
    const { sessionId, userId } = await contact();
    const other = await seedFixture(db);
    const saved = await request(sessionId);
    const done = (owner: string) =>
      db.query('select public.mark_prospect_request_done($1, $2, $3) as done', [
        sessionId,
        saved.id,
        owner,
      ]);
    expect((await done(other.userId)).rows).toEqual([{ done: false }]);
    expect((await done(userId)).rows).toEqual([{ done: true }]);
    const first = (
      await db.query('select done_at from public.prospect_requests where id = $1', [saved.id])
    ).rows[0];
    expect((await done(userId)).rows).toEqual([{ done: true }]);
    expect(
      (await db.query('select done_at from public.prospect_requests where id = $1', [saved.id]))
        .rows[0],
    ).toEqual(first);
    expect(
      (await db.query('select followup_sent_at from public.sessions where id = $1', [sessionId]))
        .rows[0],
    ).toEqual({ followup_sent_at: expect.any(Date) });
  });
  it('deletes all request statuses through Remove my details', async () => {
    const { sessionId, userId } = await contact();
    await request(sessionId);
    await request(sessionId);
    await db.query('select public.delete_session($1, $2)', [sessionId, userId]);
    expect(
      (await db.query('select * from public.prospect_requests where session_id = $1', [sessionId]))
        .rows,
    ).toEqual([]);
  });
  it('purges every request with expired contact data', async () => {
    const { sessionId } = await contact();
    await request(sessionId);
    await db.exec('alter table public.sessions disable trigger sessions_set_updated_at');
    try {
      await db.query(
        "update public.sessions set registered_at = '2024-01-01', updated_at = '2024-01-01', first_viewed_at = '2024-01-01' where id = $1",
        [sessionId],
      );
    } finally {
      await db.exec('alter table public.sessions enable trigger sessions_set_updated_at');
    }
    await db.query("select public.purge_expired_sessions(12, '2026-11-14')");
    expect(
      (await db.query('select * from public.prospect_requests where session_id = $1', [sessionId]))
        .rows,
    ).toEqual([]);
  });
  it('allows owner reads only, with no anonymous reads or direct authenticated writes/RPCs', async () => {
    const own = await contact();
    const other = await contact();
    await request(own.sessionId);
    await request(other.sessionId);
    await db.exec('begin');
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [own.userId]);
      await db.exec('set local role authenticated');
      expect((await db.query('select session_id from public.prospect_requests')).rows).toEqual([
        { session_id: own.sessionId },
      ]);
      await expect(
        db.query("update public.prospect_requests set status = 'withdrawn'"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('rollback');
    }
    for (const role of ['anon', 'authenticated']) {
      await db.exec('begin');
      try {
        await db.exec(`set local role ${role}`);
        await expect(request(own.sessionId)).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec('rollback');
      }
    }
    await db.exec('begin');
    try {
      await db.exec('set local role anon');
      await expect(db.query('select * from public.prospect_requests')).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.exec('rollback');
    }
  });
  it('refuses stale holding, inactive, replied, dropped and booked contacts at the write boundary', async () => {
    const { sessionId } = await contact();
    await db.query(
      "update public.sessions set first_viewed_at = now() - interval '25 hours' where id = $1",
      [sessionId],
    );
    await expect(request(sessionId)).rejects.toThrow(/request_not_ready/);
    await db.query('update public.sessions set details_completed_at = now() where id = $1', [
      sessionId,
    ]);
    for (const outcome of ['replied', 'dropped']) {
      await db.query('update public.sessions set followup_outcome = $2 where id = $1', [
        sessionId,
        outcome,
      ]);
      await expect(request(sessionId)).rejects.toThrow(/request_closed/);
    }
    await db.query(
      "update public.sessions set followup_outcome = null, status = 'voided' where id = $1",
      [sessionId],
    );
    await expect(request(sessionId)).rejects.toThrow(/request_not_ready/);
    await db.query("update public.sessions set status = 'active' where id = $1", [sessionId]);
    await db.query(
      "insert into public.bookings(session_id, provider, provider_event_id, status) values ($1, 'cal', $2, 'confirmed')",
      [sessionId, crypto.randomUUID()],
    );
    await expect(request(sessionId)).rejects.toThrow(/request_closed/);
  });
});
