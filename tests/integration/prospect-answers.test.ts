import { readFileSync } from 'node:fs';
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
              prospect_form_answers = '[{"label":"Request","value":"A quote please"}]'::jsonb,
              prospect_consent_at = now(),
              last_viewed_at = now(),
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
              prospect_submitted_phone, prospect_form_answers, prospect_consent_at, prospect_answer_token_hash
         from public.sessions where id = $1`,
      [sessionId],
    );
    expect(rows[0]).toEqual({
      prospect_picked_problems: null,
      prospect_submitted_email: null,
      prospect_submitted_phone: null,
      prospect_form_answers: null,
      prospect_consent_at: null,
      prospect_answer_token_hash: null,
    });
  });

  it('keeps profile config nullable and enforces JSON shapes and size guards', async () => {
    const { sessionId, userId } = await contact();
    expect(
      (await db.query('select contact_form from public.profiles where id = $1', [userId])).rows,
    ).toEqual([{ contact_form: null }]);
    await db.query('update public.profiles set contact_form = $1::jsonb where id = $2', [
      JSON.stringify({ enabled: true }),
      userId,
    ]);
    for (const [table, column, id] of [
      ['profiles', 'contact_form', userId],
      ['sessions', 'prospect_form_answers', sessionId],
    ]) {
      const invalidShape = table === 'profiles' ? [] : {};
      await expect(
        db.query(`update public.${table} set ${column} = $1::jsonb where id = $2`, [
          JSON.stringify(invalidShape),
          id,
        ]),
      ).rejects.toThrow(/check constraint/);
      const large = Array.from({ length: 1000 }, () => crypto.randomUUID()).join('');
      const oversized =
        table === 'profiles' ? { title: large } : [{ label: 'Request', value: large }];
      await expect(
        db.query(`update public.${table} set ${column} = $1::jsonb where id = $2`, [
          JSON.stringify(oversized),
          id,
        ]),
      ).rejects.toThrow(/check constraint/);
    }
  });
  it('timestamps every counted prospect view while keeping the first view and source', async () => {
    const { sessionId } = await contact(false);
    expect(
      (await db.query('select last_viewed_at from public.sessions where id = $1', [sessionId]))
        .rows,
    ).toEqual([{ last_viewed_at: null }]);
    await db.query('select public.record_prospect_view($1, $2)', [sessionId, 'qr']);
    const first = (
      await db.query<{ first_viewed_at: Date; last_viewed_at: Date }>(
        'select first_viewed_at, last_viewed_at from public.sessions where id = $1',
        [sessionId],
      )
    ).rows[0]!;
    expect(first.last_viewed_at).toEqual(first.first_viewed_at);
    await db.query("update public.sessions set last_viewed_at = '2020-01-01' where id = $1", [
      sessionId,
    ]);
    await db.query('select public.record_prospect_view($1, $2)', [sessionId, 'nfc']);
    const row = (
      await db.query<{
        view_count: number;
        first_viewed_at: Date;
        last_viewed_at: Date;
        first_view_source: string;
      }>(
        'select view_count, first_viewed_at, last_viewed_at, first_view_source from public.sessions where id = $1',
        [sessionId],
      )
    ).rows[0]!;
    expect(row.view_count).toBe(2);
    expect(row.first_viewed_at).toEqual(first.first_viewed_at);
    expect(row.first_view_source).toBe('qr');
    expect(new Date(row.last_viewed_at).getTime()).toBeGreaterThanOrEqual(
      new Date(first.last_viewed_at).getTime(),
    );
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

  it('never queues automatic delivery when the note becomes readable', async () => {
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
    expect((await jobs()).rows).toEqual([]);
    await db.query(`update public.sessions set enrichment_status = 'completed' where id = $1`, [
      sessionId,
    ]);
    expect((await jobs()).rows).toHaveLength(0);
  });

  it('never queues automatic delivery on approval or disabling review', async () => {
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
    expect((await jobs()).rows).toHaveLength(0);
    await db.query(
      `delete from public.jobs where session_id = $1 and type = 'prospect_note_email'`,
      [sessionId],
    );
    await db.query(`update public.sessions set pitch_approved_revision = null where id = $1`, [
      sessionId,
    ]);
    await db.query(`update public.profiles set review_before_live = false where id = $1`, [userId]);
    expect((await jobs()).rows).toHaveLength(0);
  });

  it('never queues automatic delivery for rep-written notes or mobile contacts', async () => {
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
    expect((await jobs()).rows).toHaveLength(0);
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

it('removes only queued automatic note emails when upgrading', async () => {
  const previous = await createTestDb('20261113120000_contact_exchange.sql');
  try {
    const fixture = await seedFixture(previous, { cards: 1 });
    for (const [type, status] of [
      ['prospect_note_email', 'queued'],
      ['prospect_note_email', 'running'],
      ['event_digest', 'queued'],
    ]) {
      await previous.query('insert into public.jobs(type, user_id, status) values ($1, $2, $3)', [
        type,
        fixture.userId,
        status,
      ]);
    }
    await previous.exec(
      readFileSync('supabase/migrations/20261113120000_contact_exchange.sql', 'utf8'),
    );
    expect(
      (await previous.query('select type, status from public.jobs order by type')).rows,
    ).toEqual([
      { type: 'event_digest', status: 'queued' },
      { type: 'prospect_note_email', status: 'running' },
    ]);
    expect(
      (
        await previous.query(
          "select tgname from pg_trigger where tgname = 'queue_prospect_note_email'",
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await previous.query(
          "select proname from pg_proc where proname = 'queue_prospect_note_email'",
        )
      ).rows,
    ).toEqual([]);
  } finally {
    await previous.close();
  }
});
