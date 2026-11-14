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

async function screenCard(age: string) {
  const fixture = await seedFixture(db, { cards: 1 });
  await db.query(
    `update public.cards set screen_issued_at = statement_timestamp() - $1::interval where code = $2`,
    [age, fixture.codes[0]!],
  );
  return fixture;
}
const tap = (userId: string, code: string, by = 'prospect_tap', id = crypto.randomUUID()) =>
  db.query<{ id: string }>(`select * from public.tap_register_card($1, $2, $3, $4)`, [
    id,
    code,
    userId,
    by,
  ]);

describe('screen QR first scan', () => {
  it('keeps issuance contact-free, then binds a fresh screen code to its owner once', async () => {
    const { userId, codes } = await screenCard('29 minutes');
    expect(
      (await db.query(`select id from public.sessions where user_id = $1`, [userId])).rows,
    ).toHaveLength(0);
    const { rows } = await tap(userId, codes[0]!);
    expect(rows).toHaveLength(1);
    await expect(tap(userId, codes[0]!)).rejects.toThrow(/card_already_assigned/);
    // An already-bound contact continues to work after the display deadline.
    await db.query(
      `update public.cards set screen_issued_at = statement_timestamp() - interval '1 hour' where code = $1`,
      [codes[0]!],
    );
    expect((await tap(userId, codes[0]!, 'prospect_tap', rows[0]!.id)).rows[0]!.id).toBe(
      rows[0]!.id,
    );
    await db.query(`select public.record_prospect_view($1, 'qr')`, [rows[0]!.id]);
    expect(
      (
        await db.query<{ first_view_source: string }>(
          `select first_view_source from public.sessions where id = $1`,
          [rows[0]!.id],
        )
      ).rows[0]!.first_view_source,
    ).toBe('qr');
  });

  it.each(['30 minutes', '31 minutes', '1 day'])(
    'never binds an unused screen code aged %s',
    async (age) => {
      const { userId, codes } = await screenCard(age);
      await expect(tap(userId, codes[0]!)).rejects.toThrow(/screen_qr_expired/);
      expect(
        (
          await db.query<{ status: string }>(`select status from public.cards where code = $1`, [
            codes[0]!,
          ])
        ).rows[0]!.status,
      ).toBe('available');
      expect(
        (await db.query(`select id from public.sessions where user_id = $1`, [userId])).rows,
      ).toHaveLength(0);
    },
  );

  it('does not let a rep register a screen code before a scan', async () => {
    const { userId, codes } = await screenCard('1 minute');
    await expect(tap(userId, codes[0]!, 'Sam')).rejects.toThrow(/screen_qr_not_scanned/);
  });

  it('cannot release and reuse a scanned screen code before the view counter catches up', async () => {
    const { userId, codes } = await screenCard('1 minute');
    const id = (await tap(userId, codes[0]!)).rows[0]!.id;
    await expect(db.query(`select public.release_card($1, $2)`, [id, userId])).rejects.toThrow(
      /card_not_releasable/,
    );
    expect(
      (await db.query<{ status: string }>(`select status from public.sessions where id = $1`, [id]))
        .rows[0]!.status,
    ).toBe('active');
    expect(
      (
        await db.query<{ status: string }>(`select status from public.cards where code = $1`, [
          codes[0],
        ])
      ).rows[0]!.status,
    ).toBe('assigned');
    await expect(tap(userId, codes[0]!)).rejects.toThrow(/card_already_assigned/);
  });

  it('checks the wall clock at binding even when the statement started before expiry', async () => {
    const { userId, codes } = await screenCard('1 minute');
    // Models time spent waiting inside the same RPC statement, such as on a lock.
    await expect(
      db.exec(`do $test$
      begin
        update public.cards set screen_issued_at = statement_timestamp() - interval '29 minutes 59.95 seconds' where code = '${codes[0]!}';
        perform pg_sleep(0.1);
        perform public.tap_register_card('${crypto.randomUUID()}', '${codes[0]!}', '${userId}', 'prospect_tap');
      end $test$;`),
    ).rejects.toThrow(/screen_qr_expired/);
  });

  it('does not let a direct authenticated insert forge a prospect scan', async () => {
    const { userId, eventId, codes } = await screenCard('1 minute');
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
    await db.exec('set role authenticated');
    try {
      await expect(
        db.query(
          `insert into public.sessions(id, user_id, card_id, event_id, event_sequence_number, colour_tag, registered_by)
        select $1, $2, id, $3, 1, 'Blue', 'prospect_tap' from public.cards where code = $4`,
          [crypto.randomUUID(), userId, eventId, codes[0]],
        ),
      ).rejects.toThrow(/screen_qr_not_scanned/);
    } finally {
      await db.exec('reset role');
    }
  });

  it('checks ownership and leaves old physical cards usable', async () => {
    const screen = await screenCard('1 minute');
    const other = await seedFixture(db, { cards: 1 });
    await expect(tap(other.userId, screen.codes[0]!)).rejects.toThrow(/card_not_found/);
    await db.query(
      `update public.cards set created_at = now() - interval '1 year' where code = $1`,
      [other.codes[0]!],
    );
    expect((await tap(other.userId, other.codes[0]!, 'Sam')).rows).toHaveLength(1);
  });

  it('prevents an authenticated owner changing the screen issuance marker', async () => {
    const { userId, codes } = await screenCard('31 minutes');
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
    await db.exec('set role authenticated');
    try {
      await expect(
        db.query(`update public.cards set screen_issued_at = null where code = $1`, [codes[0]!]),
      ).rejects.toThrow(/screen_issuance_is_server_only/);
      await expect(
        db.query(
          `insert into public.cards(user_id, code, screen_issued_at) values ($1, '23456789', now())`,
          [userId],
        ),
      ).rejects.toThrow(/screen_issuance_is_server_only/);
    } finally {
      await db.exec('reset role');
    }
  });

  it('reuses prospect answers, note capture, chat, follow-up and removal after a scan', async () => {
    const { userId, codes } = await screenCard('1 minute');
    const id = (await tap(userId, codes[0]!)).rows[0]!.id;
    await db.query(`select public.record_prospect_view($1, 'qr')`, [id]);
    await db.query(
      `update public.sessions set prospect_picked_problems = array['Slow quotes'],
      prospect_submitted_email = 'contact@example.com', prospect_consent_at = now(),
      prospect_answer_token_hash = 'test-answer-hash' where id = $1`,
      [id],
    );
    // The thirty-minute deadline never applies to an already-bound contact.
    await db.query(
      `update public.cards set screen_issued_at = now() - interval '1 day' where code = $1`,
      [codes[0]],
    );
    const saved = await db.query<{ problems: string[]; enrichment_status: string }>(
      `select * from public.save_session_details($1, $2, $3::jsonb)`,
      [id, userId, JSON.stringify({ prospect_name: 'Sam', prospect_email: 'contact@example.com' })],
    );
    expect(saved.rows[0]!.problems).toEqual(['Slow quotes']);
    expect(saved.rows[0]!.enrichment_status).toBe('queued');
    expect(
      (await db.query(`select id from public.jobs where session_id = $1 and type = 'enrich'`, [id]))
        .rows,
    ).toHaveLength(1);
    await db.query(`select public.record_chat_turn($1, 'Can you help?', 'Yes, let’s talk.')`, [id]);
    expect(
      (await db.query(`select id from public.chat_messages where session_id = $1`, [id])).rows,
    ).toHaveLength(2);
    await db.query(`select public.save_followup_draft($1, 'email', 'Good to meet you.')`, [id]);
    expect(
      (
        await db.query<{ sent: boolean }>(`select public.mark_followup_sent($1, $2) as sent`, [
          id,
          userId,
        ])
      ).rows[0]!.sent,
    ).toBe(true);
    expect(
      (
        await db.query<{ removed: boolean }>(`select public.delete_session($1, $2) as removed`, [
          id,
          userId,
        ])
      ).rows[0]!.removed,
    ).toBe(true);
    expect(
      (await db.query(`select id from public.sessions where id = $1`, [id])).rows,
    ).toHaveLength(0);
    expect(
      (await db.query(`select id from public.chat_messages where session_id = $1`, [id])).rows,
    ).toHaveLength(0);
    await expect(tap(userId, codes[0]!)).rejects.toThrow(/card_already_assigned/);
  });

  it('retains the normal contact retention rule and never rebinds a purged screen code', async () => {
    const { userId, codes } = await screenCard('1 minute');
    const id = (await tap(userId, codes[0]!)).rows[0]!.id;
    await db.query(`select public.record_prospect_view($1, 'qr')`, [id]);
    await db.query(`select public.purge_expired_sessions(6, now() + interval '7 months')`);
    expect(
      (await db.query(`select id from public.sessions where id = $1`, [id])).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query<{ status: string }>(`select status from public.cards where code = $1`, [
          codes[0],
        ])
      ).rows[0]!.status,
    ).toBe('voided');
    await expect(tap(userId, codes[0]!)).rejects.toThrow(/card_already_assigned/);
  });
});

describe('screen QR review protections', () => {
  it('rejects reassignment through the operator RPC and direct writes', async () => {
    const screen = await screenCard('1 minute');
    const other = await seedFixture(db, { cards: 1 });
    await expect(
      db.query('select public.ops_reassign_card($1, $2)', [screen.codes[0], other.userId]),
    ).rejects.toThrow(/card_in_use/);
    await expect(
      db.query('update public.cards set user_id = $1 where code = $2', [
        other.userId,
        screen.codes[0],
      ]),
    ).rejects.toThrow(/card_in_use/);
    await db.query('select public.ops_reassign_card($1, $2)', [other.codes[0], screen.userId]);
  });

  it('atomically caps issuance per rep, ignores old and physical cards, and restricts grants', async () => {
    const { userId } = await screenCard('61 minutes');
    const results = await Promise.all(
      Array.from({ length: 35 }, (_, i) =>
        db.query('select * from public.issue_screen_card($1, $2)', [
          userId,
          `ZZZZZ${String(i).padStart(3, '0')}`,
        ]),
      ),
    );
    expect(results.filter((r) => r.rows.length === 1)).toHaveLength(30);
    expect(results.filter((r) => r.rows.length === 0)).toHaveLength(5);
    await db.query('delete from public.cards where user_id = $1', [userId]);
    expect(
      (await db.query('select * from public.issue_screen_card($1, $2)', [userId, 'DELETEDX'])).rows,
    ).toHaveLength(0);
    const other = await seedFixture(db, { cards: 1 });
    expect(
      (await db.query('select * from public.issue_screen_card($1, $2)', [other.userId, 'YYYYYYYY']))
        .rows,
    ).toHaveLength(1);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      try {
        await expect(
          db.query('select * from public.issue_screen_card($1, $2)', [userId, 'XXXXXXXX']),
        ).rejects.toThrow(/permission denied/);
        await expect(db.query('select * from public.ops_card_stock()')).rejects.toThrow(
          /permission denied/,
        );
      } finally {
        await db.exec('reset role');
      }
    }
    const { rows } = await db.query<{ prosecdef: boolean; proconfig: string[] }>(
      "select prosecdef, proconfig from pg_proc where proname = 'issue_screen_card'",
    );
    expect(rows[0]).toEqual({ prosecdef: true, proconfig: ['search_path=public, pg_temp'] });
  });

  it('preserves retired codes and the issuance budget when an owner deletes a card', async () => {
    const { userId } = await seedFixture(db, { cards: 0 });
    await db.query('select * from public.issue_screen_card($1, $2)', [userId, 'RECYCLED']);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    await db.exec('set role authenticated');
    try {
      await expect(
        db.query("delete from public.screen_card_codes where code = 'RECYCLED'"),
      ).rejects.toThrow(/permission denied/);
      await db.query("delete from public.cards where code = 'RECYCLED'");
      await expect(
        db.query("insert into public.cards(user_id, code) values ($1, 'RECYCLED')", [userId]),
      ).rejects.toMatchObject({
        code: '23505',
        message: expect.stringMatching(/card_already_assigned/),
      });
    } finally {
      await db.exec('reset role');
    }
    expect(
      (await db.query('select * from public.screen_card_codes where user_id = $1', [userId])).rows,
    ).toHaveLength(1);
    await db.query('delete from auth.users where id = $1', [userId]);
    expect(
      (
        await db.query<{ user_id: string | null }>(
          "select user_id from public.screen_card_codes where code = 'RECYCLED'",
        )
      ).rows[0]?.user_id,
    ).toBeNull();
  });

  it('holds a distinct advisory lock per rep until the issuance transaction ends', async () => {
    const first = await seedFixture(db, { cards: 0 });
    const second = await seedFixture(db, { cards: 0 });
    await db.exec('begin');
    try {
      await db.query('select * from public.issue_screen_card($1, $2)', [first.userId, 'LOCKAAAA']);
      await db.query('select * from public.issue_screen_card($1, $2)', [first.userId, 'LOCKBBBB']);
      const locks = () =>
        db.query(
          "select mode from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()",
        );
      expect((await locks()).rows).toEqual([{ mode: 'ExclusiveLock' }]);
      await db.query('select * from public.issue_screen_card($1, $2)', [second.userId, 'LOCKCCCC']);
      expect((await locks()).rows).toHaveLength(2);
    } finally {
      await db.exec('rollback');
    }
    expect(
      (
        await db.query(
          "select mode from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()",
        )
      ).rows,
    ).toHaveLength(0);
  });

  it('aggregates physical and screen stock beyond the REST row cap', async () => {
    const { userId } = await seedFixture(db, { cards: 0 });
    await db.query(
      `insert into public.cards(user_id, code, status, written_at, verified_at, screen_issued_at)
      select $1, 'Q' || lpad(i::text, 7, '0'),
        case when i = 1003 then 'assigned' when i = 1004 then 'voided' else 'available' end,
        case when i = 1002 then now() end, null,
        case when i <= 1000 then now() end
      from generate_series(1, 1004) i`,
      [userId],
    );
    const { rows } = await db.query('select * from public.ops_card_stock() where user_id = $1', [
      userId,
    ]);
    expect(rows[0]).toEqual({
      user_id: userId,
      in_stock: 2,
      handed_out: 1,
      lost: 1,
      needs_writing: 1,
      needs_verifying: 1,
      screen_issued: 1000,
    });
  });

  it('keeps screen codes single-use after executing the documented rollback', async () => {
    await db.exec('begin');
    try {
      const unused = await screenCard('1 minute');
      const live = await screenCard('1 minute');
      const removed = await screenCard('1 minute');
      const liveId = (await tap(live.userId, live.codes[0]!)).rows[0]!.id;
      const removedId = (await tap(removed.userId, removed.codes[0]!)).rows[0]!.id;
      await db.query('delete from public.sessions where id = $1', [removedId]);
      const sql = readFileSync('supabase/migrations/20261114090000_screen_qr.sql', 'utf8');
      const rollback = sql
        .split('-- BEGIN ROLLBACK\n')[1]!
        .split('-- END ROLLBACK')[0]!
        .replace(/^-- ?/gm, '')
        .replace(/^(begin|commit);$/gm, '');
      await db.exec(rollback);
      for (const fixture of [unused, removed]) {
        expect(
          (
            await db.query<{ status: string }>('select status from public.cards where code = $1', [
              fixture.codes[0],
            ])
          ).rows[0]!.status,
        ).toBe('voided');
        await db.exec('savepoint rejected_scan');
        await expect(tap(fixture.userId, fixture.codes[0]!)).rejects.toThrow(
          /card_already_assigned/,
        );
        await db.exec('rollback to savepoint rejected_scan');
      }
      await db.exec('savepoint rejected_recreation');
      await db.query('delete from public.cards where code = $1', [unused.codes[0]]);
      await expect(
        db.query('insert into public.cards(user_id, code) values ($1, $2)', [
          unused.userId,
          unused.codes[0],
        ]),
      ).rejects.toThrow(/card_already_assigned/);
      await db.exec('rollback to savepoint rejected_recreation');
      await db.exec('savepoint rejected_release');
      await expect(
        db.query('select public.release_card($1, $2)', [liveId, live.userId]),
      ).rejects.toThrow(/card_not_releasable/);
      await db.exec('rollback to savepoint rejected_release');
      expect(
        (
          await db.query<{ status: string }>('select status from public.sessions where id = $1', [
            liveId,
          ])
        ).rows[0]!.status,
      ).toBe('active');
    } finally {
      await db.exec('rollback');
    }
  });
});
