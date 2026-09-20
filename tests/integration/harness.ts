/**
 * Integration-test harness — a real Postgres, in process.
 *
 * The spec's Phase 1 and Phase 3 done-when criteria are database facts, not
 * application facts: "a direct attempt to insert a second active session for one
 * card is rejected by the database", "20 jobs enqueued at once run exactly once
 * each". Those cannot be asserted against a mock.
 *
 * PGlite is a real PostgreSQL compiled to WASM, so the migrations in
 * supabase/migrations/ run unmodified, including plpgsql and partial unique
 * indexes. That keeps these tests honest without requiring Docker on every
 * machine that wants to run the suite.
 *
 * What it is NOT: it has no GoTrue and no PostgREST, so the `auth` schema and the
 * Supabase roles are created by the shim below. RLS policies are created by the
 * migrations and can be exercised by setting the request claim, but the
 * application never relies on them (§22.6: RLS is the backstop, not the only
 * check).
 */
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateCodes } from '@/lib/domain/codes';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * Everything Supabase provides that the migrations depend on. Kept deliberately
 * small: if a migration needs more than this, it is probably relying on something
 * that should be in the repo.
 */
const SUPABASE_SHIM = `
create schema if not exists auth;

create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz not null default now()
);

-- Reads the same claim Supabase sets. Tests can impersonate a user with
-- set_config('request.jwt.claim.sub', '<uuid>', true).
create or replace function auth.uid() returns uuid
language sql stable as $shim$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$shim$;

do $shim$
begin
  create role anon;
exception when duplicate_object then null;
end $shim$;

do $shim$
begin
  create role authenticated;
exception when duplicate_object then null;
end $shim$;

do $shim$
begin
  create role service_role;
exception when duplicate_object then null;
end $shim$;
`;

export type TestDb = PGlite;

/** Boots a fresh database and applies every migration in the repo, in order. */
export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    throw new Error(`No migrations found in ${MIGRATIONS_DIR}`);
  }

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }

  return db;
}

/** The fixture most tests need: a rep, an event, and some available cards. */
export type Fixture = {
  userId: string;
  eventId: string;
  codes: string[];
};

export async function seedFixture(
  db: TestDb,
  options: { cards?: number; email?: string } = {},
): Promise<Fixture> {
  const cardCount = options.cards ?? 5;
  const email = options.email ?? `rep-${crypto.randomUUID()}@example.com`;

  const user = await db.query<{ id: string }>(
    `insert into auth.users(email) values ($1) returning id`,
    [email],
  );
  const userId = user.rows[0]!.id;

  await db.query(`insert into public.profiles(id, full_name) values ($1, $2)`, [userId, 'Zaid']);

  const event = await db.query<{ id: string }>(
    `insert into public.events(user_id, name, niches)
     values ($1, $2, $3::jsonb) returning id`,
    [
      userId,
      'Plant Hire Expo',
      JSON.stringify([
        { name: 'plant hire', problems: ['Idle machine tracking', 'Manual timesheets'] },
      ]),
    ],
  );
  const eventId = event.rows[0]!.id;

  // cards.code is globally unique, so fixtures must not share codes. Using the
  // real generator keeps the fixture honest and exercises it on every run.
  const codes = generateCodes((size) => crypto.getRandomValues(new Uint8Array(size)), cardCount);
  for (const code of codes) {
    await db.query(`insert into public.cards(user_id, code) values ($1, $2)`, [userId, code]);
  }

  return { userId, eventId, codes };
}
