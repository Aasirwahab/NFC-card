import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, seedFixture, type TestDb } from './harness';

/**
 * Operating model v2 (2026-09-29): the first tap on an unused card creates the
 * session, filed under the event that is on, else under a per-rep "Unsorted".
 */

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

const today = "(now() at time zone 'Europe/London')::date";

async function tapRegister(userId: string, code: string, by = 'prospect_tap') {
  // "Today" is the rep's own day (profiles.timezone). These tests build their dates in
  // London time, so the rep is set to London; a separate test covers another zone.
  await db.query(`update public.profiles set timezone = 'Europe/London' where id = $1`, [userId]);
  return db.query<{ id: string; event_id: string; event_sequence_number: number }>(
    `select * from public.tap_register_card($1, $2, $3, $4)`,
    [crypto.randomUUID(), code, userId, by],
  );
}

describe('tap_register_card', () => {
  it('files the session under an event dated today', async () => {
    const { userId, eventId, codes } = await seedFixture(db, { cards: 2 });
    await db.query(`update public.events set event_date = ${today} where id = $1`, [eventId]);

    const { rows } = await tapRegister(userId, codes[0]!);
    expect(rows[0]!.event_id).toBe(eventId);
    expect(rows[0]!.event_sequence_number).toBe(1);

    const second = await tapRegister(userId, codes[1]!);
    expect(second.rows[0]!.event_sequence_number).toBe(2);
  });

  it('still counts an event that was a day or two ago, not a week ago', async () => {
    const { userId, eventId, codes } = await seedFixture(db, { cards: 1 });
    await db.query(`update public.events set event_date = ${today} - 2 where id = $1`, [eventId]);
    expect((await tapRegister(userId, codes[0]!)).rows[0]!.event_id).toBe(eventId);

    const other = await seedFixture(db, { cards: 1 });
    await db.query(`update public.events set event_date = ${today} - 7 where id = $1`, [
      other.eventId,
    ]);
    const { rows } = await tapRegister(other.userId, other.codes[0]!);
    expect(rows[0]!.event_id).not.toBe(other.eventId);
  });

  it('picks an event dated tomorrow, and the nearest date when two are close', async () => {
    const { userId, eventId, codes } = await seedFixture(db, { cards: 1 });
    await db.query(`update public.events set event_date = ${today} + 1 where id = $1`, [eventId]);
    const far = await db.query<{ id: string }>(
      `insert into public.events(user_id, name, event_date) values ($1, 'Earlier', ${today} - 2) returning id`,
      [userId],
    );
    expect(far.rows).toHaveLength(1);
    expect((await tapRegister(userId, codes[0]!)).rows[0]!.event_id).toBe(eventId);
  });

  it('falls back to one "Unsorted" event that carries the newest event\'s niches', async () => {
    const { userId, eventId, codes } = await seedFixture(db, { cards: 2 });
    await db.query(`update public.events set event_date = ${today} - 30 where id = $1`, [eventId]);

    const a = await tapRegister(userId, codes[0]!);
    const b = await tapRegister(userId, codes[1]!);
    expect(a.rows[0]!.event_id).toBe(b.rows[0]!.event_id);

    const { rows } = await db.query<{ name: string; niches: { name: string }[] }>(
      `select name, niches from public.events where id = $1`,
      [a.rows[0]!.event_id],
    );
    expect(rows[0]!.name).toBe('Unsorted');
    expect(rows[0]!.niches[0]!.name).toBe('plant hire');

    const count = await db.query(
      `select 1 from public.events where user_id = $1 and name = 'Unsorted'`,
      [userId],
    );
    expect(count.rows).toHaveLength(1);
  });

  it('is idempotent on the session id and does not create an event on a replay', async () => {
    const { userId, eventId, codes } = await seedFixture(db, { cards: 1 });
    await db.query(`update public.events set event_date = ${today} where id = $1`, [eventId]);

    const id = crypto.randomUUID();
    const first = await db.query(`select * from public.tap_register_card($1, $2, $3, 'rep')`, [
      id,
      codes[0],
      userId,
    ]);
    const again = await db.query(`select * from public.tap_register_card($1, $2, $3, 'rep')`, [
      id,
      codes[0],
      userId,
    ]);
    expect(again.rows[0]).toEqual(first.rows[0]);
  });

  it("refuses a card that already has a session, and a card that is not the rep's", async () => {
    const { userId, codes } = await seedFixture(db, { cards: 1 });
    await tapRegister(userId, codes[0]!);
    await expect(tapRegister(userId, codes[0]!)).rejects.toThrow(/card_already_assigned/);

    const stranger = await seedFixture(db, { cards: 1 });
    await expect(tapRegister(stranger.userId, codes[0]!)).rejects.toThrow(/card_not_found/);
  });
});

describe('the rep own time zone', () => {
  it('decides which event is "on": an event dated today in Auckland is on for an Auckland rep', async () => {
    const { userId, eventId, codes } = await seedFixture(db, { cards: 1 });
    await db.query(`update public.profiles set timezone = 'Pacific/Auckland' where id = $1`, [
      userId,
    ]);
    await db.query(
      `update public.events set event_date = (now() at time zone 'Pacific/Auckland')::date where id = $1`,
      [eventId],
    );
    const { rows } = await db.query<{ event_id: string }>(
      `select * from public.tap_register_card($1, $2, $3, 'rep')`,
      [crypto.randomUUID(), codes[0], userId],
    );
    expect(rows[0]!.event_id).toBe(eventId);
  });

  it('falls back to UTC for a zone name Postgres does not know', async () => {
    const { userId, codes } = await seedFixture(db, { cards: 1 });
    await db.query(`update public.profiles set timezone = 'Not/AZone' where id = $1`, [userId]);
    const { rows } = await db.query<{ id: string }>(
      `select * from public.tap_register_card($1, $2, $3, 'rep')`,
      [crypto.randomUUID(), codes[0], userId],
    );
    expect(rows).toHaveLength(1);
  });
});

describe('mark_card_lost', () => {
  it('voids an unused card so it can never be registered', async () => {
    const { userId, codes } = await seedFixture(db, { cards: 1 });
    await db.query(`select public.mark_card_lost($1, $2)`, [codes[0], userId]);

    const { rows } = await db.query<{ status: string }>(
      `select status from public.cards where code = $1`,
      [codes[0]],
    );
    expect(rows[0]!.status).toBe('voided');
    await expect(tapRegister(userId, codes[0]!)).rejects.toThrow(/card_already_assigned/);
  });

  it('refuses a card that already has a lead', async () => {
    const { userId, codes } = await seedFixture(db, { cards: 1 });
    await tapRegister(userId, codes[0]!);
    await expect(
      db.query(`select public.mark_card_lost($1, $2)`, [codes[0], userId]),
    ).rejects.toThrow(/card_in_use/);
  });
});

describe('move_session_to_event', () => {
  it('takes the next sequence number of the target event and keeps numbering unique', async () => {
    const { userId, eventId, codes } = await seedFixture(db, { cards: 2 });
    await db.query(`update public.events set event_date = ${today} - 30 where id = $1`, [eventId]);
    const first = await tapRegister(userId, codes[0]!); // lands in Unsorted
    const unsorted = first.rows[0]!.event_id;
    expect(unsorted).not.toBe(eventId);

    const moved = await db.query<{ event_id: string; event_sequence_number: number }>(
      `select * from public.move_session_to_event($1, $2, $3)`,
      [first.rows[0]!.id, eventId, userId],
    );
    expect(moved.rows[0]!.event_id).toBe(eventId);
    expect(moved.rows[0]!.event_sequence_number).toBe(1);

    // A second lead moved to the same event gets 2, not 1 again.
    const second = await tapRegister(userId, codes[1]!);
    const movedTwo = await db.query<{ event_sequence_number: number }>(
      `select * from public.move_session_to_event($1, $2, $3)`,
      [second.rows[0]!.id, eventId, userId],
    );
    expect(movedTwo.rows[0]!.event_sequence_number).toBe(2);
  });

  it("refuses another rep's session or event", async () => {
    const a = await seedFixture(db, { cards: 1 });
    const b = await seedFixture(db, { cards: 1 });
    const session = await tapRegister(a.userId, a.codes[0]!);
    await expect(
      db.query(`select * from public.move_session_to_event($1, $2, $3)`, [
        session.rows[0]!.id,
        b.eventId,
        a.userId,
      ]),
    ).rejects.toThrow(/event_not_found/);
    await expect(
      db.query(`select * from public.move_session_to_event($1, $2, $3)`, [
        session.rows[0]!.id,
        a.eventId,
        b.userId,
      ]),
    ).rejects.toThrow(/session_not_found/);
  });
});
