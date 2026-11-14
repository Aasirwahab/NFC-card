import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, seedFixture, type TestDb } from './harness';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

async function contact(withAnswers = true) {
  const fixture = await seedFixture(db, { cards: 1 });
  const sessionId = crypto.randomUUID();
  await db.query(`select * from public.register_card($1, $2, $3, $4, 'Rep', null)`, [
    sessionId,
    fixture.codes[0],
    fixture.eventId,
    fixture.userId,
  ]);
  if (withAnswers) {
    await db.query(
      `update public.sessions
          set prospect_picked_problems = $1,
              prospect_submitted_email = 'prospect@example.com',
              prospect_submitted_phone = '+447700900123',
              prospect_consent_at = now(),
              prospect_answer_token_hash = 'hash'
        where id = $2`,
      [['Idle machine tracking'], sessionId],
    );
  }
  return { ...fixture, sessionId };
}

describe('prospect answer storage and privacy', () => {
  it('keeps all new fields nullable on existing and newly registered contacts', async () => {
    const { sessionId } = await contact(false);
    const { rows } = await db.query(
      `select prospect_picked_problems, prospect_submitted_email,
              prospect_submitted_phone, prospect_consent_at, prospect_answer_token_hash
         from public.sessions where id = $1`,
      [sessionId],
    );
    expect(rows[0]).toEqual({
      prospect_picked_problems: null,
      prospect_submitted_email: null,
      prospect_submitted_phone: null,
      prospect_consent_at: null,
      prospect_answer_token_hash: null,
    });
  });

  it('removes every prospect answer through the Remove my details deletion RPC', async () => {
    const { sessionId, userId } = await contact();
    await db.query(`select public.delete_session($1, $2)`, [sessionId, userId]);
    expect(
      (await db.query(`select * from public.sessions where id = $1`, [sessionId])).rows,
    ).toEqual([]);
  });

  it('purges the new answers with an expired contact', async () => {
    const { sessionId } = await contact();
    await db.exec(`alter table public.sessions disable trigger sessions_set_updated_at`);
    try {
      await db.query(
        `update public.sessions
            set registered_at = '2024-01-01', updated_at = '2024-01-01'
          where id = $1`,
        [sessionId],
      );
    } finally {
      await db.exec(`alter table public.sessions enable trigger sessions_set_updated_at`);
    }
    await db.query(`select public.purge_expired_sessions(12, '2026-11-13')`);
    expect(
      (await db.query(`select * from public.sessions where id = $1`, [sessionId])).rows,
    ).toEqual([]);
  });

  it('keeps prospect answers behind the existing owner RLS and denies anonymous table access', async () => {
    const own = await contact();
    const other = await contact();
    await db.exec('begin');
    try {
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [own.userId]);
      await db.exec('set local role authenticated');
      const { rows } = await db.query<{ prospect_submitted_email: string }>(
        `select prospect_submitted_email from public.sessions where id = any($1::uuid[])`,
        [[own.sessionId, other.sessionId]],
      );
      expect(rows).toEqual([{ prospect_submitted_email: 'prospect@example.com' }]);
    } finally {
      await db.exec('rollback');
    }
    await db.exec('begin');
    try {
      await db.exec('set local role anon');
      await expect(
        db.query('select prospect_submitted_email from public.sessions'),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('rollback');
    }
  });

  it('accepts made_with_opened through the existing session event table', async () => {
    const { sessionId } = await contact();
    await db.query(
      `insert into public.session_events(session_id, type) values ($1, 'made_with_opened')`,
      [sessionId],
    );
    expect(
      (
        await db.query(
          `select type from public.session_events where session_id = $1 and type = 'made_with_opened'`,
          [sessionId],
        )
      ).rows,
    ).toEqual([{ type: 'made_with_opened' }]);
  });

  it('uses the prospect picks as raised problems when the rep saves no chips', async () => {
    const { sessionId, userId } = await contact();
    await db.query(`select public.save_session_details($1, $2, $3::jsonb)`, [
      sessionId,
      userId,
      JSON.stringify({ prospect_name: 'Tom', problems: [] }),
    ]);
    const { rows } = await db.query<{ snapshot: { session: { problems: string[] } } }>(
      `select public.enrichment_snapshot($1) as snapshot`,
      [sessionId],
    );
    expect(rows[0]!.snapshot.session.problems).toEqual(['Idle machine tracking']);
  });

  it('keeps a deliberate empty selection on the second details save', async () => {
    const { sessionId, userId } = await contact();
    for (let save = 0; save < 2; save++) {
      await db.query(`select public.save_session_details($1, $2, $3::jsonb)`, [
        sessionId,
        userId,
        JSON.stringify({ prospect_name: 'Tom', problems: [] }),
      ]);
    }
    const { rows } = await db.query<{ problems: string[] }>(
      `select problems from public.sessions where id = $1`,
      [sessionId],
    );
    expect(rows[0]!.problems).toEqual([]);
  });

  it('queues delivery as soon as the fallback note is readable, once per contact', async () => {
    const { sessionId, userId } = await contact();
    await db.query(`select public.save_session_details($1, $2, $3::jsonb)`, [
      sessionId,
      userId,
      JSON.stringify({ problems: [] }),
    ]);
    const jobs = () =>
      db.query(
        `select type from public.jobs where session_id = $1 and type = 'prospect_note_email'`,
        [sessionId],
      );
    expect((await jobs()).rows).toEqual([{ type: 'prospect_note_email' }]);
    await db.query(`update public.sessions set enrichment_status = 'completed' where id = $1`, [
      sessionId,
    ]);
    expect((await jobs()).rows).toHaveLength(1);
  });

  it('waits for review, then queues on approval or when review is disabled', async () => {
    const { sessionId, userId } = await contact();
    await db.query(`update public.profiles set review_before_live = true where id = $1`, [userId]);
    await db.query(`select public.save_session_details($1, $2, $3::jsonb)`, [
      sessionId,
      userId,
      JSON.stringify({ problems: [] }),
    ]);
    const jobs = () =>
      db.query(
        `select type from public.jobs where session_id = $1 and type = 'prospect_note_email'`,
        [sessionId],
      );
    expect((await jobs()).rows).toEqual([]);
    await db.query(
      `update public.sessions set enrichment_status = 'completed', pitch_approved_revision = details_revision where id = $1`,
      [sessionId],
    );
    expect((await jobs()).rows).toHaveLength(1);
    await db.query(
      `delete from public.jobs where session_id = $1 and type = 'prospect_note_email'`,
      [sessionId],
    );
    await db.query(`update public.sessions set pitch_approved_revision = null where id = $1`, [
      sessionId,
    ]);
    await db.query(`update public.profiles set review_before_live = false where id = $1`, [userId]);
    expect((await jobs()).rows).toHaveLength(1);
  });

  it('queues a rep-written note through a review hold but never messages a mobile-only contact', async () => {
    const { sessionId, userId } = await contact();
    await db.query(`update public.profiles set review_before_live = true where id = $1`, [userId]);
    await db.query(`select public.save_session_details($1, $2, $3::jsonb)`, [
      sessionId,
      userId,
      JSON.stringify({ problems: [] }),
    ]);
    await db.query(`select public.set_rep_pitch($1, $2, 'Your note')`, [sessionId, userId]);
    const jobs = () =>
      db.query(
        `select id from public.jobs where session_id = $1 and type = 'prospect_note_email'`,
        [sessionId],
      );
    expect((await jobs()).rows).toHaveLength(1);
    await db.query(
      `delete from public.jobs where session_id = $1 and type = 'prospect_note_email'`,
      [sessionId],
    );
    await db.query(`update public.sessions set prospect_submitted_email = null where id = $1`, [
      sessionId,
    ]);
    await db.query(`select public.set_rep_pitch($1, $2, 'Updated note')`, [sessionId, userId]);
    expect((await jobs()).rows).toEqual([]);
  });

  it('never queues a second automatic delivery after the successful session event', async () => {
    const { sessionId, userId } = await contact();
    await db.query(
      `insert into public.session_events(session_id, type) values ($1, 'prospect_note_emailed')`,
      [sessionId],
    );
    await db.query(`select public.save_session_details($1, $2, $3::jsonb)`, [
      sessionId,
      userId,
      JSON.stringify({ problems: [] }),
    ]);
    expect(
      (
        await db.query(
          `select id from public.jobs where session_id = $1 and type = 'prospect_note_email'`,
          [sessionId],
        )
      ).rows,
    ).toEqual([]);
    await expect(
      db.query(
        `insert into public.session_events(session_id, type) values ($1, 'prospect_note_emailed')`,
        [sessionId],
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('keeps the rep chips when the prospect picked a different problem', async () => {
    const { sessionId, userId } = await contact();
    await db.query(`select public.save_session_details($1, $2, $3::jsonb)`, [
      sessionId,
      userId,
      JSON.stringify({ prospect_name: 'Tom', problems: ['Manual timesheets'] }),
    ]);
    const { rows } = await db.query<{ problems: string[] }>(
      `select problems from public.sessions where id = $1`,
      [sessionId],
    );
    expect(rows[0]!.problems).toEqual(['Manual timesheets']);
  });
});
