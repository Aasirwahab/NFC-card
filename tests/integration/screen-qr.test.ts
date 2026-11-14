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
