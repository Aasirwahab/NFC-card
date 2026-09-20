import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, seedFixture, type TestDb } from './harness';
import { COLOUR_PALETTE, colourForSequence } from '@/lib/domain/colours';

/**
 * Phase 1 done-when (spec §26):
 *   - a self-tap registers, and tapping the same card twice shows the existing
 *     session rather than creating a second
 *   - a direct attempt to insert a second active session for one card is
 *     REJECTED BY THE DATABASE
 *
 * These are the invariants §9.5 says the schema must enforce, because the
 * application will be written partly by AI assistants over months and the schema
 * is the thing that cannot be talked out of a rule.
 */

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

describe('migrations', () => {
  it('create every table the spec names', async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' order by table_name`,
    );
    const tables = rows.map((r) => r.table_name);

    expect(tables).toEqual([
      'bookings',
      'business_profiles',
      'card_batches',
      'cards',
      'chat_messages',
      'events',
      'followup_drafts',
      'jobs',
      'knowledge_base',
      'profiles',
      'session_events',
      'sessions',
    ]);
  });

  it('enable row level security on every table (§11.6)', async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by c.relname`,
    );

    const withoutRls = rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    expect(withoutRls).toEqual([]);
  });

  it('grant the anon role nothing in the public schema (§11.6)', async () => {
    const { rows } = await db.query<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type
         from information_schema.role_table_grants
        where grantee = 'anon' and table_schema = 'public'`,
    );

    // There is no path by which a browser reads the sessions table directly, and
    // that is what makes prospect names and personal notes safe.
    expect(rows).toEqual([]);
  });
});

describe('colour_for_sequence', () => {
  it('agrees with lib/domain/colours.ts across several cycles', async () => {
    const sequences = Array.from({ length: 25 }, (_, i) => i + 1);
    const { rows } = await db.query<{ seq: number; colour: string }>(
      `select s as seq, public.colour_for_sequence(s) as colour
         from generate_series(1, 25) as s order by s`,
    );

    expect(rows).toHaveLength(sequences.length);
    for (const { seq, colour } of rows) {
      expect(colour, `sequence ${seq}`).toBe(colourForSequence(seq));
    }
  });

  it('repeats the palette every eight cards (§10.3)', async () => {
    const { rows } = await db.query<{ a: string; b: string }>(
      `select public.colour_for_sequence(1) as a, public.colour_for_sequence(9) as b`,
    );
    expect(rows[0]!.a).toBe(rows[0]!.b);
    expect(rows[0]!.a).toBe(COLOUR_PALETTE[0]);
  });
});

describe('register_card (§12.1)', () => {
  it('assigns a sequence number and colour, and marks the card assigned', async () => {
    const fx = await seedFixture(db);
    const sessionId = crypto.randomUUID();

    const { rows } = await db.query<{
      id: string;
      event_sequence_number: number;
      colour_tag: string;
      prospect_name: string | null;
    }>(`select * from public.register_card($1, $2, $3, $4, $5, $6)`, [
      sessionId,
      fx.codes[0]!,
      fx.eventId,
      fx.userId,
      'Zaid',
      'Tom',
    ]);

    const session = rows[0]!;
    expect(session.id).toBe(sessionId);
    expect(session.event_sequence_number).toBe(1);
    expect(session.colour_tag).toBe('Red');
    expect(session.prospect_name).toBe('Tom');

    const card = await db.query<{ status: string }>(
      `select status from public.cards where code = $1`,
      [fx.codes[0]!],
    );
    expect(card.rows[0]!.status).toBe('assigned');

    const events = await db.query<{ type: string }>(
      `select type from public.session_events where session_id = $1`,
      [sessionId],
    );
    expect(events.rows.map((r) => r.type)).toEqual(['registered']);
  });

  it('is idempotent: the same device-generated id twice returns one session', async () => {
    const fx = await seedFixture(db);
    const sessionId = crypto.randomUUID();
    const args = [sessionId, fx.codes[0]!, fx.eventId, fx.userId, 'Zaid', null];

    const first = await db.query<{ id: string; event_sequence_number: number }>(
      `select * from public.register_card($1, $2, $3, $4, $5, $6)`,
      args,
    );
    const second = await db.query<{ id: string; event_sequence_number: number }>(
      `select * from public.register_card($1, $2, $3, $4, $5, $6)`,
      args,
    );

    expect(second.rows[0]!.id).toBe(first.rows[0]!.id);
    // Critically, the replay must NOT burn a second sequence number.
    expect(second.rows[0]!.event_sequence_number).toBe(first.rows[0]!.event_sequence_number);

    const count = await db.query<{ n: number }>(
      `select count(*)::int as n from public.sessions where card_id =
         (select id from public.cards where code = $1)`,
      [fx.codes[0]!],
    );
    expect(count.rows[0]!.n).toBe(1);
  });

  it('refuses a card that is already assigned', async () => {
    const fx = await seedFixture(db);
    await db.query(`select * from public.register_card($1, $2, $3, $4, $5, $6)`, [
      crypto.randomUUID(),
      fx.codes[0]!,
      fx.eventId,
      fx.userId,
      'Zaid',
      null,
    ]);

    await expect(
      db.query(`select * from public.register_card($1, $2, $3, $4, $5, $6)`, [
        crypto.randomUUID(), // a different device, the same card
        fx.codes[0]!,
        fx.eventId,
        fx.userId,
        'Zaid',
        null,
      ]),
    ).rejects.toThrow(/card_already_assigned/);
  });

  it('refuses an unknown code and an unknown event', async () => {
    const fx = await seedFixture(db);

    await expect(
      db.query(`select * from public.register_card($1, $2, $3, $4, $5, $6)`, [
        crypto.randomUUID(),
        'ZZZZZZZZ',
        fx.eventId,
        fx.userId,
        'Zaid',
        null,
      ]),
    ).rejects.toThrow(/card_not_found/);

    await expect(
      db.query(`select * from public.register_card($1, $2, $3, $4, $5, $6)`, [
        crypto.randomUUID(),
        fx.codes[1]!,
        crypto.randomUUID(),
        fx.userId,
        'Zaid',
        null,
      ]),
    ).rejects.toThrow(/event_not_found/);
  });

  it('will not let one rep register another rep’s card', async () => {
    const mine = await seedFixture(db);
    const theirs = await seedFixture(db);

    await expect(
      db.query(`select * from public.register_card($1, $2, $3, $4, $5, $6)`, [
        crypto.randomUUID(),
        theirs.codes[0]!,
        mine.eventId,
        mine.userId,
        'Zaid',
        null,
      ]),
    ).rejects.toThrow(/card_not_found/);
  });

  it('numbers cards per event, starting at 1 each time (§10.3)', async () => {
    const fx = await seedFixture(db, { cards: 3 });
    const otherEvent = await db.query<{ id: string }>(
      `insert into public.events(user_id, name) values ($1, $2) returning id`,
      [fx.userId, 'Maritime Compliance Summit'],
    );

    const first = await db.query<{ event_sequence_number: number; colour_tag: string }>(
      `select * from public.register_card($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), fx.codes[0]!, fx.eventId, fx.userId, 'Zaid', null],
    );
    const second = await db.query<{ event_sequence_number: number; colour_tag: string }>(
      `select * from public.register_card($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), fx.codes[1]!, fx.eventId, fx.userId, 'Zaid', null],
    );
    const otherEventFirst = await db.query<{ event_sequence_number: number }>(
      `select * from public.register_card($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), fx.codes[2]!, otherEvent.rows[0]!.id, fx.userId, 'Zaid', null],
    );

    expect(first.rows[0]!.event_sequence_number).toBe(1);
    expect(first.rows[0]!.colour_tag).toBe('Red');
    expect(second.rows[0]!.event_sequence_number).toBe(2);
    expect(second.rows[0]!.colour_tag).toBe('Blue');
    // The counter is per event, so the second event starts at 1 again.
    expect(otherEventFirst.rows[0]!.event_sequence_number).toBe(1);
  });
});

describe('the data-leak guard (§11.3)', () => {
  it('rejects a second ACTIVE session for one card, at the database level', async () => {
    const fx = await seedFixture(db);
    const first = crypto.randomUUID();
    await db.query(`select * from public.register_card($1, $2, $3, $4, $5, $6)`, [
      first,
      fx.codes[0]!,
      fx.eventId,
      fx.userId,
      'Zaid',
      null,
    ]);

    const cardId = (
      await db.query<{ id: string }>(`select id from public.cards where code = $1`, [fx.codes[0]!])
    ).rows[0]!.id;

    // Bypass register_card entirely — this is the "direct attempt" the spec names.
    // Without sessions_one_active_per_card, an old prospect tapping a month later
    // would be shown a newer prospect's name, company and personal notes.
    await expect(
      db.query(
        `insert into public.sessions
           (id, user_id, card_id, event_id, event_sequence_number, colour_tag, registered_by)
         values ($1, $2, $3, $4, 99, 'Teal', 'Someone')`,
        [crypto.randomUUID(), fx.userId, cardId, fx.eventId],
      ),
    ).rejects.toThrow(/sessions_one_active_per_card|duplicate key/);
  });

  it('allows a replacement session once the first is voided (§10.1)', async () => {
    const fx = await seedFixture(db);
    const sessionId = crypto.randomUUID();
    await db.query(`select * from public.register_card($1, $2, $3, $4, $5, $6)`, [
      sessionId,
      fx.codes[0]!,
      fx.eventId,
      fx.userId,
      'Zaid',
      null,
    ]);

    await db.query(`select * from public.void_session($1, $2)`, [sessionId, fx.userId]);

    const card = await db.query<{ status: string }>(
      `select status from public.cards where code = $1`,
      [fx.codes[0]!],
    );
    // The card is voided too, because it may already be in someone's pocket.
    expect(card.rows[0]!.status).toBe('voided');

    const cardId = (
      await db.query<{ id: string }>(`select id from public.cards where code = $1`, [fx.codes[0]!])
    ).rows[0]!.id;

    // The partial index only covers active rows, so the audit trail can hold both.
    await expect(
      db.query(
        `insert into public.sessions
           (id, user_id, card_id, event_id, event_sequence_number, colour_tag, registered_by)
         values ($1, $2, $3, $4, 2, 'Blue', 'Zaid')`,
        [crypto.randomUUID(), fx.userId, cardId, fx.eventId],
      ),
    ).resolves.toBeDefined();
  });
});

describe('save_session_details (§13)', () => {
  it('writes details and enqueues the job in one transaction', async () => {
    const fx = await seedFixture(db);
    const sessionId = crypto.randomUUID();
    await db.query(`select * from public.register_card($1, $2, $3, $4, $5, $6)`, [
      sessionId,
      fx.codes[0]!,
      fx.eventId,
      fx.userId,
      'Zaid',
      null,
    ]);

    const { rows } = await db.query<{
      prospect_name: string;
      problems: string[];
      enrichment_status: string;
      details_completed_at: string | null;
    }>(`select * from public.save_session_details($1, $2, $3::jsonb)`, [
      sessionId,
      fx.userId,
      JSON.stringify({
        prospect_name: 'Tom',
        prospect_company: 'BuildRite',
        problems: ['Idle machine tracking'],
        memorable_info: 'Arsenal fan, two kids',
        prospect_phone: '',
      }),
    ]);

    const session = rows[0]!;
    expect(session.prospect_name).toBe('Tom');
    expect(session.problems).toEqual(['Idle machine tracking']);
    expect(session.enrichment_status).toBe('queued');
    expect(session.details_completed_at).not.toBeNull();

    const jobs = await db.query<{ n: number }>(
      `select count(*)::int as n from public.jobs where session_id = $1 and status = 'queued'`,
      [sessionId],
    );
    expect(jobs.rows[0]!.n).toBe(1);
  });

  it('never creates a second live job for one session (§11.4)', async () => {
    const fx = await seedFixture(db);
    const sessionId = crypto.randomUUID();
    await db.query(`select * from public.register_card($1, $2, $3, $4, $5, $6)`, [
      sessionId,
      fx.codes[0]!,
      fx.eventId,
      fx.userId,
      'Zaid',
      null,
    ]);

    const details = JSON.stringify({ prospect_name: 'Tom', problems: [] });
    // A rep editing the same session three times. Both the after() kick and the
    // cron sweep can reach the same row; a double-enqueue must be impossible.
    for (let i = 0; i < 3; i++) {
      await db.query(`select * from public.save_session_details($1, $2, $3::jsonb)`, [
        sessionId,
        fx.userId,
        details,
      ]);
    }

    const jobs = await db.query<{ n: number }>(
      `select count(*)::int as n from public.jobs where session_id = $1`,
      [sessionId],
    );
    expect(jobs.rows[0]!.n).toBe(1);
  });

  it('refuses to write details for another rep’s session', async () => {
    const mine = await seedFixture(db);
    const theirs = await seedFixture(db);
    const sessionId = crypto.randomUUID();
    await db.query(`select * from public.register_card($1, $2, $3, $4, $5, $6)`, [
      sessionId,
      mine.codes[0]!,
      mine.eventId,
      mine.userId,
      'Zaid',
      null,
    ]);

    await expect(
      db.query(`select * from public.save_session_details($1, $2, $3::jsonb)`, [
        sessionId,
        theirs.userId,
        JSON.stringify({ prospect_name: 'Snooping' }),
      ]),
    ).rejects.toThrow(/session_not_found/);
  });
});

describe('record_prospect_view (§10.4)', () => {
  it('sets first_viewed_at once and counts every subsequent view', async () => {
    const fx = await seedFixture(db);
    const sessionId = crypto.randomUUID();
    await db.query(`select * from public.register_card($1, $2, $3, $4, $5, $6)`, [
      sessionId,
      fx.codes[0]!,
      fx.eventId,
      fx.userId,
      'Zaid',
      null,
    ]);

    const first = await db.query<{ record_prospect_view: boolean }>(
      `select public.record_prospect_view($1)`,
      [sessionId],
    );
    expect(first.rows[0]!.record_prospect_view).toBe(true);

    const second = await db.query<{ record_prospect_view: boolean }>(
      `select public.record_prospect_view($1)`,
      [sessionId],
    );
    expect(second.rows[0]!.record_prospect_view).toBe(false);

    const { rows } = await db.query<{ view_count: number; first_viewed_at: string }>(
      `select view_count, first_viewed_at from public.sessions where id = $1`,
      [sessionId],
    );
    expect(rows[0]!.view_count).toBe(2);
    expect(rows[0]!.first_viewed_at).not.toBeNull();

    // The audit trail records the first view once, not twice.
    const events = await db.query<{ n: number }>(
      `select count(*)::int as n from public.session_events
        where session_id = $1 and type = 'prospect_viewed'`,
      [sessionId],
    );
    expect(events.rows[0]!.n).toBe(1);
  });
});

describe('complete_enrichment (§12.3)', () => {
  it('is a no-op on replay', async () => {
    const fx = await seedFixture(db);
    const sessionId = crypto.randomUUID();
    await db.query(`select * from public.register_card($1, $2, $3, $4, $5, $6)`, [
      sessionId,
      fx.codes[0]!,
      fx.eventId,
      fx.userId,
      'Zaid',
      null,
    ]);

    const args = [sessionId, JSON.stringify({ signals: [] }), 'A specific pitch.', 'model-a'];
    await db.query(`select public.complete_enrichment($1, $2::jsonb, $3, $4)`, args);
    await db.query(`select public.complete_enrichment($1, $2::jsonb, $3, $4)`, [
      sessionId,
      JSON.stringify({ signals: ['different'] }),
      'A DIFFERENT pitch that must not overwrite the first.',
      'model-b',
    ]);

    const { rows } = await db.query<{ generated_pitch: string; generated_pitch_model: string }>(
      `select generated_pitch, generated_pitch_model from public.sessions where id = $1`,
      [sessionId],
    );
    expect(rows[0]!.generated_pitch).toBe('A specific pitch.');
    expect(rows[0]!.generated_pitch_model).toBe('model-a');

    const events = await db.query<{ n: number }>(
      `select count(*)::int as n from public.session_events
        where session_id = $1 and type = 'enrichment_completed'`,
      [sessionId],
    );
    expect(events.rows[0]!.n).toBe(1);
  });
});
