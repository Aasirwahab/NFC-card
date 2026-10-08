import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, seedFixture, type TestDb } from './harness';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});

async function newUser(email: string) {
  const r = await db.query<{ id: string }>(
    `insert into auth.users(email) values ($1) returning id`,
    [email],
  );
  return r.rows[0]!.id;
}

describe('ops_reassign_card', () => {
  it('moves an unused card to another rep and detaches it from the old batch', async () => {
    const a = await seedFixture(db, { cards: 2 });
    const b = await newUser(`b-${crypto.randomUUID()}@example.com`);
    await db.query(`select public.ops_reassign_card($1, $2)`, [a.codes[0], b]);
    const r = await db.query<{ user_id: string; batch_id: string | null }>(
      `select user_id, batch_id from public.cards where code = $1`,
      [a.codes[0]],
    );
    expect(r.rows[0]!.user_id).toBe(b);
    expect(r.rows[0]!.batch_id).toBeNull();
  });

  it('refuses a card that is in use, voided, or unknown, and an unknown user', async () => {
    const a = await seedFixture(db, { cards: 3 });
    const b = await newUser(`b-${crypto.randomUUID()}@example.com`);

    await db.query(`update public.cards set status = 'voided' where code = $1`, [a.codes[0]]);
    await expect(
      db.query(`select public.ops_reassign_card($1, $2)`, [a.codes[0], b]),
    ).rejects.toThrow(/card_in_use/);

    await db.query(`select public.register_card($1, $2, $3, $4, 'rep', null)`, [
      crypto.randomUUID(),
      a.codes[1],
      a.eventId,
      a.userId,
    ]);
    await expect(
      db.query(`select public.ops_reassign_card($1, $2)`, [a.codes[1], b]),
    ).rejects.toThrow(/card_in_use/);

    await expect(db.query(`select public.ops_reassign_card('ZZZZZZZZ', $1)`, [b])).rejects.toThrow(
      /card_not_found/,
    );
    await expect(
      db.query(`select public.ops_reassign_card($1, $2)`, [a.codes[2], crypto.randomUUID()]),
    ).rejects.toThrow(/user_not_found/);
  });
});

describe('programming state', () => {
  it('cards start unwritten and unverified', async () => {
    const f = await seedFixture(db, { cards: 1 });
    const r = await db.query<{ written_at: string | null; verified_at: string | null }>(
      `select written_at, verified_at from public.cards where code = $1`,
      [f.codes[0]],
    );
    expect(r.rows[0]).toEqual({ written_at: null, verified_at: null });
  });

  it('a verifying update only touches an available, unverified card, once', async () => {
    const f = await seedFixture(db, { cards: 1 });
    const verify = () =>
      db.query(
        `update public.cards set verified_at = now()
          where code = $1 and status = 'available' and verified_at is null returning code`,
        [f.codes[0]],
      );
    expect((await verify()).rows).toHaveLength(1);
    expect((await verify()).rows).toHaveLength(0);
  });
});

describe('low stock, audit and orders', () => {
  it('defaults the reorder level to 5 and bounds it', async () => {
    const f = await seedFixture(db, { cards: 0 });
    const r = await db.query<{ low_stock_at: number }>(
      `select low_stock_at from public.profiles where id = $1`,
      [f.userId],
    );
    expect(r.rows[0]!.low_stock_at).toBe(5);
    await expect(
      db.query(`update public.profiles set low_stock_at = 9999 where id = $1`, [f.userId]),
    ).rejects.toThrow();
  });

  it('writes audit rows and walks an order through its states', async () => {
    const f = await seedFixture(db, { cards: 0 });
    await db.query(
      `insert into public.staff_audit_log(actor_email, action, target_user_id) values ('a@b.com','issue_batch',$1)`,
      [f.userId],
    );
    const audit = await db.query(`select * from public.staff_audit_log where target_user_id = $1`, [
      f.userId,
    ]);
    expect(audit.rows).toHaveLength(1);

    const order = await db.query<{ id: string; status: string }>(
      `insert into public.card_orders(user_id, quantity) values ($1, 20) returning id, status`,
      [f.userId],
    );
    expect(order.rows[0]!.status).toBe('requested');
    for (const status of ['ordered', 'shipped']) {
      await db.query(`update public.card_orders set status = $1 where id = $2`, [
        status,
        order.rows[0]!.id,
      ]);
    }
    await expect(
      db.query(`update public.card_orders set status = 'lost' where id = $1`, [order.rows[0]!.id]),
    ).rejects.toThrow();
    await expect(
      db.query(`insert into public.card_orders(user_id, quantity) values ($1, 0)`, [f.userId]),
    ).rejects.toThrow();
  });
});

describe('programming columns are server only', () => {
  it('a rep session cannot set them, the service role can', async () => {
    const f = await seedFixture(db, { cards: 1 });
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [f.userId]);
    await db.query(`set role authenticated`);
    try {
      await expect(
        db.query(`update public.cards set verified_at = now() where code = $1`, [f.codes[0]]),
      ).rejects.toThrow(/programming_columns_are_server_only/);
      // Other columns are not blocked by this trigger.
      await db.query(`update public.cards set status = status where code = $1`, [f.codes[0]]);
    } finally {
      await db.query(`reset role`);
    }
    await db.query(`update public.cards set verified_at = now() where code = $1`, [f.codes[0]]);
  });
});
