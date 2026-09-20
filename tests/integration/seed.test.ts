import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness';
import { viewForSession } from '@/lib/domain/render-state';
import { isValidCode } from '@/lib/domain/codes';

/**
 * Phase 2 done-when (§26): "each of the four states can be produced on demand
 * and screenshotted."
 *
 * supabase/seed.sql is how. This test proves the seed actually produces all four
 * — otherwise the screenshot step turns into an afternoon of hand-editing rows,
 * and the states nobody can easily reach are the ones that rot.
 */

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();

  // The seed attaches to the first user in auth.users.
  await db.query(`insert into auth.users(email) values ('zaid@example.com')`);

  const seed = readFileSync(join(process.cwd(), 'supabase', 'seed.sql'), 'utf8');
  await db.exec(seed);
});

describe('supabase/seed.sql', () => {
  it('produces all four landing-page states', async () => {
    const { rows } = await db.query<{
      code: string;
      enrichment_status: string;
      generated_pitch: string | null;
      details_completed_at: string | null;
    }>(`
      select c.code, s.enrichment_status, s.generated_pitch, s.details_completed_at
        from public.cards c
        join public.sessions s on s.card_id = c.id and s.status = 'active'
       where c.code like 'DEM%'
       order by c.code
    `);

    const byCode = new Map(rows.map((r) => [r.code, r]));
    expect([...byCode.keys()].sort()).toEqual(['DEMXDUNE', 'DEMXFA23', 'DEMXPEND', 'DEMXWRKG']);

    expect(viewForSession(byCode.get('DEMXDUNE')!).state).toBe('completed');
    expect(viewForSession(byCode.get('DEMXWRKG')!).state).toBe('crafting');
    expect(viewForSession(byCode.get('DEMXFA23')!).state).toBe('failed');
    expect(viewForSession(byCode.get('DEMXPEND')!).state).toBe('pending');
  });

  it('uses codes from the real alphabet, so they behave like production codes', async () => {
    const { rows } = await db.query<{ code: string }>(
      `select code from public.cards where code like 'DEM%'`,
    );
    for (const { code } of rows) {
      expect(isValidCode(code), code).toBe(true);
    }
  });

  it('leaves the pending card with no details, which is what makes it pending', async () => {
    const { rows } = await db.query<{
      details_completed_at: string | null;
      prospect_name: string | null;
    }>(
      `select s.details_completed_at, s.prospect_name
         from public.sessions s join public.cards c on c.id = s.card_id
        where c.code = 'DEMXPEND'`,
    );
    expect(rows[0]!.details_completed_at).toBeNull();
  });

  it('leaves a real queued job behind the crafting card', async () => {
    // The crafting state is only honest if something is actually working on it.
    const { rows } = await db.query<{ status: string }>(
      `select j.status from public.jobs j
         join public.sessions s on s.id = j.session_id
         join public.cards c on c.id = s.card_id
        where c.code = 'DEMXWRKG'`,
    );
    expect(rows.map((r) => r.status)).toEqual(['queued']);
  });

  it('is idempotent — running it twice leaves one of each', async () => {
    const seed = readFileSync(join(process.cwd(), 'supabase', 'seed.sql'), 'utf8');
    await db.exec(seed);

    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.cards where code like 'DEM%'`,
    );
    expect(rows[0]!.n).toBe(4);

    const events = await db.query<{ n: number }>(
      `select count(*)::int as n from public.events where name = 'Demo — Plant Hire Expo'`,
    );
    expect(events.rows[0]!.n).toBe(1);
  });
});
