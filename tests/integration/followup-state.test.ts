import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, seedFixture, type TestDb } from './harness';

const MIGRATION = '20261106090000_followup_state.sql';

async function session(db: TestDb, registeredAt = '2026-10-05T18:00:00Z') {
  const fx = await seedFixture(db, { cards: 1 });
  const sessionId = crypto.randomUUID();
  await db.query(`select * from public.register_card($1, $2, $3, $4, $5, null)`, [
    sessionId,
    fx.codes[0]!,
    fx.eventId,
    fx.userId,
    'Zaid',
  ]);
  await db.query(`select * from public.save_session_details($1, $2, $3::jsonb)`, [
    sessionId,
    fx.userId,
    JSON.stringify({ prospect_name: 'Tom', linkedin_url: 'https://www.linkedin.com/in/tom' }),
  ]);
  await db.query(`delete from public.jobs where session_id = $1`, [sessionId]);
  await db.query(`update public.sessions set registered_at = $1 where id = $2`, [
    registeredAt,
    sessionId,
  ]);
  return { ...fx, sessionId };
}

describe('the follow-up state migration', () => {
  it('backfills followup_sent_at from drafts already marked sent', async () => {
    const db = await createTestDb(MIGRATION);
    const sent = await session(db);
    const unsent = await session(db);
    for (const fx of [sent, unsent]) {
      await db.query(`select public.save_followup_draft($1, 'linkedin', 'x')`, [fx.sessionId]);
    }
    await db.query(`select public.mark_followup_sent($1, $2)`, [sent.sessionId, sent.userId]);
    const { rows: before } = await db.query<{ sent_at: string }>(
      `select sent_at from public.followup_drafts where session_id = $1`,
      [sent.sessionId],
    );

    const { rows: activityBefore } = await db.query<{ id: string; updated_at: Date }>(
      `select id, updated_at from public.sessions where id = any($1) order by id`,
      [[sent.sessionId, unsent.sessionId]],
    );

    await db.exec(readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8'));

    const { rows } = await db.query<{ id: string; followup_sent_at: Date | null }>(
      `select id, followup_sent_at from public.sessions where id = any($1)`,
      [[sent.sessionId, unsent.sessionId]],
    );
    const byId = new Map(rows.map((r) => [r.id, r.followup_sent_at]));
    expect(byId.get(sent.sessionId)?.getTime()).toBe(new Date(before[0]!.sent_at).getTime());
    expect(byId.get(unsent.sessionId)).toBeNull();
    const { rows: activityAfter } = await db.query<{ id: string; updated_at: Date }>(
      `select id, updated_at from public.sessions where id = any($1) order by id`,
      [[sent.sessionId, unsent.sessionId]],
    );
    expect(activityAfter).toEqual(activityBefore);
    await db.query(`update public.sessions set prospect_name = 'Updated' where id = $1`, [
      sent.sessionId,
    ]);
    const { rows: changed } = await db.query<{ updated_at: Date }>(
      `select updated_at from public.sessions where id = $1`,
      [sent.sessionId],
    );
    expect(changed[0]!.updated_at.getTime()).toBeGreaterThan(
      activityBefore.find((row) => row.id === sent.sessionId)!.updated_at.getTime(),
    );
  });
});

describe('follow-up state in the database', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });

  const markSent = async (sessionId: string, userId: string) =>
    (
      await db.query<{ mark_followup_sent: boolean }>(`select public.mark_followup_sent($1, $2)`, [
        sessionId,
        userId,
      ])
    ).rows[0]!.mark_followup_sent;
  const sentEvents = async (sessionId: string) =>
    (
      await db.query(
        `select 1 from public.session_events where session_id = $1 and type = 'followup_sent'`,
        [sessionId],
      )
    ).rows.length;

  it('marks sent once without a draft: the second call records nothing new', async () => {
    const fx = await session(db);
    expect(await markSent(fx.sessionId, fx.userId)).toBe(true);
    const first = await db.query<{ followup_sent_at: Date }>(
      `select followup_sent_at from public.sessions where id = $1`,
      [fx.sessionId],
    );
    expect(await markSent(fx.sessionId, fx.userId)).toBe(true);
    const second = await db.query<{ followup_sent_at: Date }>(
      `select followup_sent_at from public.sessions where id = $1`,
      [fx.sessionId],
    );
    expect(second.rows[0]!.followup_sent_at).toEqual(first.rows[0]!.followup_sent_at);
    expect(await sentEvents(fx.sessionId)).toBe(1);
  });

  it('does not let another rep, or a voided session, be marked sent', async () => {
    const fx = await session(db);
    expect(await markSent(fx.sessionId, crypto.randomUUID())).toBe(false);
    expect(await sentEvents(fx.sessionId)).toBe(0);
    await db.query(`update public.sessions set status = 'voided' where id = $1`, [fx.sessionId]);
    expect(await markSent(fx.sessionId, fx.userId)).toBe(false);
  });

  it.each(['replied', 'dropped'])(
    'rejects a stale Done for a %s contact without recording a send',
    async (outcome) => {
      const fx = await session(db);
      await db.query(`select public.save_followup_draft($1, 'linkedin', 'x')`, [fx.sessionId]);
      await db.query(`update public.sessions set followup_outcome = $1 where id = $2`, [
        outcome,
        fx.sessionId,
      ]);
      expect(await markSent(fx.sessionId, crypto.randomUUID())).toBe(false);
      await expect(markSent(fx.sessionId, fx.userId)).rejects.toThrow('followup_closed');
      const { rows } = await db.query<{ followup_sent_at: Date | null; sent_at: Date | null }>(
        `select s.followup_sent_at, d.sent_at from public.sessions s
       join public.followup_drafts d on d.session_id = s.id where s.id = $1`,
        [fx.sessionId],
      );
      expect(rows[0]).toEqual({ followup_sent_at: null, sent_at: null });
      expect(await sentEvents(fx.sessionId)).toBe(0);
    },
  );

  it('accepts only replied or dropped as an outcome', async () => {
    const fx = await session(db);
    await db.query(`update public.sessions set followup_outcome = 'dropped' where id = $1`, [
      fx.sessionId,
    ]);
    await expect(
      db.query(`update public.sessions set followup_outcome = 'maybe' where id = $1`, [
        fx.sessionId,
      ]),
    ).rejects.toThrow();
  });

  it('leaves an existing draft untouched for another rep or an inactive contact', async () => {
    const fx = await session(db);
    await db.query(`select public.save_followup_draft($1, 'linkedin', 'x')`, [fx.sessionId]);
    expect(await markSent(fx.sessionId, crypto.randomUUID())).toBe(false);
    let draft = await db.query<{ sent_at: Date | null }>(
      `select sent_at from public.followup_drafts where session_id = $1`,
      [fx.sessionId],
    );
    expect(draft.rows[0]!.sent_at).toBeNull();
    await db.query(`update public.sessions set status = 'voided' where id = $1`, [fx.sessionId]);
    expect(await markSent(fx.sessionId, fx.userId)).toBe(false);
    draft = await db.query<{ sent_at: Date | null }>(
      `select sent_at from public.followup_drafts where session_id = $1`,
      [fx.sessionId],
    );
    expect(draft.rows[0]!.sent_at).toBeNull();
  });

  it.each(['replied', 'dropped'])('never queues a draft for a %s lead', async (outcome) => {
    const fx = await session(db);
    await db.query(`update public.sessions set followup_outcome = $1 where id = $2`, [
      outcome,
      fx.sessionId,
    ]);
    await db.query(`select public.queue_no_tap_followups($1)`, ['2026-10-06T19:00:00Z']);
    const jobs = await db.query(`select 1 from public.jobs where session_id = $1`, [fx.sessionId]);
    expect(jobs.rows).toHaveLength(0);
  });

  it('never queues a draft once the rep has followed up', async () => {
    const fx = await session(db);
    await markSent(fx.sessionId, fx.userId);
    await db.query(`select public.queue_no_tap_followups($1)`, ['2026-10-06T19:00:00Z']);
    const jobs = await db.query(`select 1 from public.jobs where session_id = $1`, [fx.sessionId]);
    expect(jobs.rows).toHaveLength(0);
  });

  it('keeps the rpc locked to the service role after the rewrite', async () => {
    const { rows } = await db.query<{ anon: boolean; service: boolean }>(
      `select has_function_privilege('anon', 'public.mark_followup_sent(uuid, uuid)', 'execute') as anon,
              has_function_privilege('service_role', 'public.mark_followup_sent(uuid, uuid)', 'execute') as service`,
    );
    expect(rows[0]).toEqual({ anon: false, service: true });
  });
});
