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
      'event_digests',
      'events',
      'followup_drafts',
      'jobs',
      'knowledge_base',
      'pitch_ratings',
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

  it('let no API role execute any function in public (§9.2)', async () => {
    // Every function here is reachable at /rest/v1/rpc/<name> by any role that
    // can execute it. Five of them are SECURITY DEFINER and take a p_user_id
    // argument, so executable-by-anon means "anyone can register, edit, void or
    // overwrite the pitch on any session". Only route handlers holding the
    // service role may call them.
    //
    // This test exists because the first version of the migrations revoked from
    // PUBLIC only, which misses Supabase's explicit grants to anon and
    // authenticated. It passed here and failed on the live project.
    const { rows } = await db.query<{ fn: string; anon: boolean; authenticated: boolean }>(
      `select p.proname as fn,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
        order by p.proname`,
    );

    expect(rows.length).toBeGreaterThan(0);
    const exposed = rows.filter((r) => r.anon || r.authenticated);
    expect(exposed.map((r) => `${r.fn} anon=${r.anon} authenticated=${r.authenticated}`)).toEqual(
      [],
    );
  });

  it('keep a function added by a FUTURE migration locked down too', async () => {
    // The default privileges are what stop the next migration from reopening
    // the hole by forgetting a revoke. Simulate that next migration.
    await db.exec(`
      create function public.future_helper() returns int
      language sql security definer set search_path = public, pg_temp
      as $fn$ select 1 $fn$;
      create table public.future_table (id int primary key);
    `);

    const fn = await db.query<{ anon: boolean; authenticated: boolean }>(
      `select has_function_privilege('anon', 'public.future_helper()', 'execute') as anon,
              has_function_privilege('authenticated', 'public.future_helper()', 'execute')
                as authenticated`,
    );
    expect(fn.rows[0]).toEqual({ anon: false, authenticated: false });

    const table = await db.query<{ n: number }>(
      `select count(*)::int as n from information_schema.role_table_grants
        where grantee = 'anon' and table_name = 'future_table'`,
    );
    expect(table.rows[0]!.n).toBe(0);

    await db.exec(`drop function public.future_helper(); drop table public.future_table;`);
  });

  it('still let the service role execute every RPC the routes call', async () => {
    const rpcs = [
      'register_card',
      'save_session_details',
      'void_session',
      'record_prospect_view',
      'claim_jobs',
      'complete_enrichment',
      'set_rep_pitch',
      'rate_pitch',
      'claim_chat_response',
      'release_chat_response',
      'record_chat_turn',
      'record_booking',
      'confirm_prospect_website',
      'queue_event_digests',
    ];
    const { rows } = await db.query<{ fn: string; ok: boolean }>(
      `select p.proname as fn, has_function_privilege('service_role', p.oid, 'execute') as ok
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any($1)`,
      [rpcs],
    );
    expect(rows.filter((r) => !r.ok).map((r) => r.fn)).toEqual([]);
    expect(rows).toHaveLength(rpcs.length);
  });

  it('evaluate auth.uid() once per query in every policy (Supabase lint 0003)', async () => {
    // A bare auth.uid() in a policy is re-evaluated for every row scanned.
    // Wrapped in a sub-select, the planner runs it once as an InitPlan.
    const { rows } = await db.query<{ policy: string; qual: string; roles: string[] }>(
      `select tablename || '.' || policyname as policy,
              coalesce(qual, '') || ' ' || coalesce(with_check, '') as qual,
              roles::text[] as roles
         from pg_policies where schemaname = 'public'`,
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const { policy, qual, roles } of rows) {
      const bare = qual.replace(/SELECT auth\.uid\(\) AS uid/gi, '').match(/auth\.uid\(\)/i);
      expect(bare, `${policy}: ${qual}`).toBeNull();
      // Scoped to signed-in users, so anon never even evaluates the predicate.
      expect(roles, policy).toEqual(['authenticated']);
    }
  });

  it('index every foreign key that a cascade or a lookup uses (Supabase lint 0001)', async () => {
    // A FK is only covered by a NON-partial index that leads with the FK column.
    // Unindexed, ON DELETE CASCADE scans the whole child table — and erasing a
    // prospect (§23) is exactly a cascading session delete.
    const { rows } = await db.query<{ fk: string }>(`
      select c.conrelid::regclass::text || '.' || a.attname as fk
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype = 'f' and c.connamespace = 'public'::regnamespace
         and not exists (select 1 from pg_index i
                          where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
                            and i.indpred is null)
       order by 1`);

    // sessions.card_id is deliberately served by the partial unique index alone:
    // every lookup is "the active session for this card", and cards are never
    // deleted (§24.4), so there is no cascade to scan for.
    expect(rows.map((r) => r.fk)).toEqual(['sessions.card_id']);
  });

  it('pin search_path on every function (Supabase lint 0011)', async () => {
    // A mutable search_path lets a caller shadow public objects with their own.
    const { rows } = await db.query<{ fn: string }>(
      `select p.proname as fn
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                           where c like 'search_path=%')`,
    );
    expect(rows.map((r) => r.fn)).toEqual([]);
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
  it('records which sticker opened the card, on the first view only', async () => {
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

    await db.query(`select public.record_prospect_view($1, $2)`, [sessionId, 'qr']);
    // A later NFC tap does not overwrite how the card was first opened.
    await db.query(`select public.record_prospect_view($1, $2)`, [sessionId, 'nfc']);

    const { rows } = await db.query<{ first_view_source: string }>(
      `select first_view_source from public.sessions where id = $1`,
      [sessionId],
    );
    expect(rows[0]!.first_view_source).toBe('qr');

    const events = await db.query<{ meta: { source: string } }>(
      `select meta from public.session_events where session_id = $1 and type = 'prospect_viewed'`,
      [sessionId],
    );
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]!.meta.source).toBe('qr');
  });

  it('treats a missing or unknown source as nfc', async () => {
    const fx = await seedFixture(db);
    const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
    for (const [id, code] of [
      [a, fx.codes[0]!],
      [b, fx.codes[1]!],
    ] as const) {
      await db.query(`select * from public.register_card($1, $2, $3, $4, $5, $6)`, [
        id,
        code,
        fx.eventId,
        fx.userId,
        'Zaid',
        null,
      ]);
    }

    await db.query(`select public.record_prospect_view($1)`, [a]);
    await db.query(`select public.record_prospect_view($1, $2)`, [b, "qr'; drop table x;--"]);

    const { rows } = await db.query<{ id: string; first_view_source: string }>(
      `select id, first_view_source from public.sessions where id = any($1)`,
      [[a, b]],
    );
    expect(rows.map((r) => r.first_view_source)).toEqual(['nfc', 'nfc']);
  });

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

describe('the chat cap (§18.1)', () => {
  async function session() {
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
    return sessionId;
  }

  const claim = async (sessionId: string) =>
    (
      await db.query<{ n: number | null }>(`select public.claim_chat_response($1) as n`, [
        sessionId,
      ])
    ).rows[0]!.n;

  it('grants five responses and refuses the sixth, even fired at once', async () => {
    const sessionId = await session();
    const results = await Promise.all(Array.from({ length: 6 }, () => claim(sessionId)));

    expect(results.filter((n) => n !== null)).toHaveLength(5);
    expect(results.filter((n) => n === null)).toHaveLength(1);
  });

  it('hands a claim back when the model call failed', async () => {
    const sessionId = await session();
    for (let i = 0; i < 5; i++) await claim(sessionId);
    expect(await claim(sessionId)).toBeNull();

    await db.query(`select public.release_chat_response($1)`, [sessionId]);
    expect(await claim(sessionId)).toBe(5);
  });

  it('never releases below zero', async () => {
    const sessionId = await session();
    await db.query(`select public.release_chat_response($1)`, [sessionId]);
    expect(await claim(sessionId)).toBe(1);
  });

  it('refuses a voided session', async () => {
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
    expect(await claim(sessionId)).toBeNull();
  });

  it('records the question and the answer together', async () => {
    const sessionId = await session();
    await db.query(`select public.record_chat_turn($1, $2, $3)`, [
      sessionId,
      'Does it work with our telematics?',
      'That one is for Zaid.',
    ]);
    const { rows } = await db.query<{ role: string; content: string }>(
      `select role, content from public.chat_messages where session_id = $1 order by id`,
      [sessionId],
    );
    expect(rows).toEqual([
      { role: 'user', content: 'Does it work with our telematics?' },
      { role: 'assistant', content: 'That one is for Zaid.' },
    ]);
  });
});

describe('record_booking (§19.1)', () => {
  async function session() {
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
    return sessionId;
  }

  const book = async (
    uid: string,
    status: string,
    sessionId: string | null,
    rescheduledFrom: string | null = null,
  ) =>
    (
      await db.query<{ r: string }>(
        `select public.record_booking($1, $2, $3, $4, $5, $6, $7) as r`,
        [uid, status, sessionId, '2026-09-24T10:00:00Z', 'tom@example.com', 'Tom', rescheduledFrom],
      )
    ).rows[0]!.r;

  const events = async (sessionId: string) =>
    (
      await db.query<{ type: string }>(
        `select type from public.session_events
          where session_id = $1 and type like 'booking_%' order by id`,
        [sessionId],
      )
    ).rows.map((r) => r.type);

  it('does not duplicate a replayed delivery', async () => {
    const sessionId = await session();
    const uid = `bk_${crypto.randomUUID()}`;

    expect(await book(uid, 'confirmed', sessionId)).toBe('created');
    expect(await book(uid, 'confirmed', sessionId)).toBe('unchanged');

    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.bookings where provider_event_id = $1`,
      [uid],
    );
    expect(rows[0]!.n).toBe(1);
    expect(await events(sessionId)).toEqual(['booking_created']);
  });

  it('updates status on a cancellation rather than deleting', async () => {
    const sessionId = await session();
    const uid = `bk_${crypto.randomUUID()}`;
    await book(uid, 'confirmed', sessionId);
    expect(await book(uid, 'cancelled', null)).toBe('updated');

    const { rows } = await db.query<{ status: string; session_id: string }>(
      `select status, session_id from public.bookings where provider_event_id = $1`,
      [uid],
    );
    // The link survives a delivery that did not carry the metadata.
    expect(rows[0]).toEqual({ status: 'cancelled', session_id: sessionId });
    expect(await events(sessionId)).toEqual(['booking_created', 'booking_cancelled']);
  });

  it('marks the original booking rescheduled', async () => {
    const sessionId = await session();
    const first = `bk_${crypto.randomUUID()}`;
    const second = `bk_${crypto.randomUUID()}`;
    await book(first, 'confirmed', sessionId);
    await book(second, 'confirmed', sessionId, first);

    const { rows } = await db.query<{ provider_event_id: string; status: string }>(
      `select provider_event_id, status from public.bookings
        where provider_event_id = any($1) order by created_at, provider_event_id`,
      [[first, second]],
    );
    expect(Object.fromEntries(rows.map((r) => [r.provider_event_id, r.status]))).toEqual({
      [first]: 'rescheduled',
      [second]: 'confirmed',
    });
  });

  it('keeps a booking whose session id names no real session, unlinked', async () => {
    const uid = `bk_${crypto.randomUUID()}`;
    expect(await book(uid, 'confirmed', crypto.randomUUID())).toBe('created');
    const { rows } = await db.query<{ session_id: string | null }>(
      `select session_id from public.bookings where provider_event_id = $1`,
      [uid],
    );
    expect(rows[0]!.session_id).toBeNull();
  });
});

describe('the tap alert (Phase 5)', () => {
  it('queues exactly one notify_tap job, on the first real view only', async () => {
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

    for (let i = 0; i < 3; i++) {
      await db.query(`select public.record_prospect_view($1)`, [sessionId]);
    }

    const { rows } = await db.query<{ n: number; user_id: string }>(
      `select count(*)::int as n, min(user_id::text) as user_id from public.jobs
        where session_id = $1 and type = 'notify_tap'`,
      [sessionId],
    );
    expect(rows[0]!.n).toBe(1);
    expect(rows[0]!.user_id).toBe(fx.userId);
  });

  it('queues nothing for a session that does not exist', async () => {
    const missing = crypto.randomUUID();
    const { rows } = await db.query<{ record_prospect_view: boolean }>(
      `select public.record_prospect_view($1)`,
      [missing],
    );
    expect(rows[0]!.record_prospect_view).toBe(false);
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

describe('the rep sees the pitch first (§14.5)', () => {
  async function registered() {
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
    return { ...fx, sessionId };
  }

  const commit = (sessionId: string, pitch: string, model = 'model-a', prompt = 'pitch-v1') =>
    db.query(`select public.complete_enrichment($1, $2::jsonb, $3, $4, null, $5)`, [
      sessionId,
      JSON.stringify({ facts: [] }),
      pitch,
      model,
      prompt,
    ]);

  it('records the prompt version alongside the model', async () => {
    const { sessionId } = await registered();
    await commit(sessionId, 'A pitch.', 'model-a', 'pitch-v7');

    const { rows } = await db.query<{ generated_pitch_prompt: string }>(
      `select generated_pitch_prompt from public.sessions where id = $1`,
      [sessionId],
    );
    expect(rows[0]!.generated_pitch_prompt).toBe('pitch-v7');
  });

  it('keeps the rep’s edit apart from the generated pitch, and resets it', async () => {
    const { sessionId, userId } = await registered();
    await commit(sessionId, 'What the model wrote.');

    await db.query(`select * from public.set_rep_pitch($1, $2, $3)`, [
      sessionId,
      userId,
      '  What Zaid wrote.  ',
    ]);
    let { rows } = await db.query<{ generated_pitch: string; rep_pitch: string | null }>(
      `select generated_pitch, rep_pitch from public.sessions where id = $1`,
      [sessionId],
    );
    expect(rows[0]!.rep_pitch).toBe('What Zaid wrote.');
    expect(rows[0]!.generated_pitch).toBe('What the model wrote.');

    await db.query(`select * from public.set_rep_pitch($1, $2, null)`, [sessionId, userId]);
    ({ rows } = await db.query<{ generated_pitch: string; rep_pitch: string | null }>(
      `select generated_pitch, rep_pitch from public.sessions where id = $1`,
      [sessionId],
    ));
    expect(rows[0]!.rep_pitch).toBeNull();

    const events = await db.query<{ type: string }>(
      `select type from public.session_events
        where session_id = $1 and type like 'pitch_%' order by id`,
      [sessionId],
    );
    expect(events.rows.map((r) => r.type)).toEqual(['pitch_edited', 'pitch_reset']);
  });

  it('never lets a re-enrich overwrite the rep’s edit', async () => {
    const { sessionId, userId } = await registered();
    await db.query(`select * from public.set_rep_pitch($1, $2, $3)`, [
      sessionId,
      userId,
      'What Zaid wrote.',
    ]);
    await db.query(`select * from public.save_session_details($1, $2, $3::jsonb)`, [
      sessionId,
      userId,
      JSON.stringify({ prospect_name: 'Tom', problems: ['Idle machine tracking'] }),
    ]);
    await commit(sessionId, 'A fresh model pitch.');

    const { rows } = await db.query<{ generated_pitch: string; rep_pitch: string }>(
      `select generated_pitch, rep_pitch from public.sessions where id = $1`,
      [sessionId],
    );
    expect(rows[0]!.generated_pitch).toBe('A fresh model pitch.');
    expect(rows[0]!.rep_pitch).toBe('What Zaid wrote.');
  });

  it('refuses to edit or rate another rep’s session', async () => {
    const mine = await registered();
    const theirs = await seedFixture(db);
    await commit(mine.sessionId, 'A pitch.');

    await expect(
      db.query(`select * from public.set_rep_pitch($1, $2, $3)`, [
        mine.sessionId,
        theirs.userId,
        'Hijacked.',
      ]),
    ).rejects.toThrow(/session_not_found/);
    await expect(
      db.query(`select * from public.rate_pitch($1, $2, 1::smallint, null)`, [
        mine.sessionId,
        theirs.userId,
      ]),
    ).rejects.toThrow(/session_not_found/);
  });

  it('rates the model’s pitch, keeps one judgement per pitch, and keeps old ones', async () => {
    const { sessionId, userId } = await registered();

    await expect(
      db.query(`select * from public.rate_pitch($1, $2, 1::smallint, null)`, [sessionId, userId]),
    ).rejects.toThrow(/nothing_to_rate/);

    await commit(sessionId, 'First pitch.', 'model-a', 'pitch-v1');
    await db.query(`select * from public.rate_pitch($1, $2, 1::smallint, null)`, [
      sessionId,
      userId,
    ]);
    // Changing your mind about the same pitch replaces the judgement.
    await db.query(`select * from public.rate_pitch($1, $2, (-1)::smallint, $3)`, [
      sessionId,
      userId,
      'Too generic',
    ]);

    // A re-enrich writes a new pitch; the old judgement survives with its text.
    await db.query(`update public.sessions set enrichment_status = 'queued' where id = $1`, [
      sessionId,
    ]);
    await commit(sessionId, 'Second pitch.', 'model-b', 'pitch-v2');
    await db.query(`select * from public.rate_pitch($1, $2, 1::smallint, null)`, [
      sessionId,
      userId,
    ]);

    const { rows } = await db.query<{
      pitch: string;
      model: string;
      prompt: string;
      rating: number;
      reason: string | null;
    }>(
      `select pitch, model, prompt, rating, reason from public.pitch_ratings
        where session_id = $1 order by id`,
      [sessionId],
    );
    expect(rows).toEqual([
      {
        pitch: 'First pitch.',
        model: 'model-a',
        prompt: 'pitch-v1',
        rating: -1,
        reason: 'Too generic',
      },
      { pitch: 'Second pitch.', model: 'model-b', prompt: 'pitch-v2', rating: 1, reason: null },
    ]);
  });

  it('rejects a rating that is not thumbs up or down', async () => {
    const { sessionId, userId } = await registered();
    await commit(sessionId, 'A pitch.');
    await expect(
      db.query(`select * from public.rate_pitch($1, $2, 5::smallint, null)`, [sessionId, userId]),
    ).rejects.toThrow();
  });
});

describe('queue_event_digests (morning-after email)', () => {
  async function eventWithCard(eventDate: string) {
    const fx = await seedFixture(db, { cards: 1 });
    await db.query(`update public.events set event_date = $1 where id = $2`, [
      eventDate,
      fx.eventId,
    ]);
    await db.query(`select * from public.register_card($1, $2, $3, $4, $5, null)`, [
      crypto.randomUUID(),
      fx.codes[0]!,
      fx.eventId,
      fx.userId,
      'Zaid',
    ]);
    return fx;
  }

  async function digestJobs(eventId: string) {
    const { rows } = await db.query<{ round: number }>(
      `select (payload->>'round')::int as round from public.jobs
        where type = 'event_digest' and payload->>'event_id' = $1 order by 1`,
      [eventId],
    );
    return rows.map((r) => r.round);
  }

  it('queues round 1 at 08:00 London the morning after, exactly once', async () => {
    const fx = await eventWithCard('2026-10-05');

    await db.query(`select public.queue_event_digests($1)`, ['2026-10-06T06:59:00Z']);
    expect(await digestJobs(fx.eventId)).toEqual([]); // 07:59 BST — not yet

    await db.query(`select public.queue_event_digests($1)`, ['2026-10-06T07:00:00Z']);
    await db.query(`select public.queue_event_digests($1)`, ['2026-10-06T07:01:00Z']);
    expect(await digestJobs(fx.eventId)).toEqual([1]);

    await db.query(`select public.queue_event_digests($1)`, ['2026-10-07T07:00:00Z']);
    expect(await digestJobs(fx.eventId)).toEqual([1, 2]);
  });

  it('never mails about an event that is long past', async () => {
    const fx = await eventWithCard('2026-01-10');
    await db.query(`select public.queue_event_digests($1)`, ['2026-10-06T07:00:00Z']);
    expect(await digestJobs(fx.eventId)).toEqual([]);
  });
});
