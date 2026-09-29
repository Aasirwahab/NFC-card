import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, seedFixture, type TestDb } from './harness';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});

async function detailedSession() {
  const { userId, codes } = await seedFixture(db, { cards: 1 });
  const id = crypto.randomUUID();
  await db.query(`select public.tap_register_card($1, $2, $3, 'rep')`, [id, codes[0], userId]);
  await db.query(`select public.save_session_details($1, $2, $3::jsonb)`, [
    id,
    userId,
    JSON.stringify({
      prospect_name: 'Sam Carter',
      prospect_company: 'Carter & Co',
      problems: ['X'],
    }),
  ]);
  return { id, userId };
}

describe('requeue_enrichment with guidance', () => {
  it('stores a trimmed, capped style request and lets a plain retry clear it', async () => {
    const { id, userId } = await detailedSession();
    const first = await db.query<{ pitch_guidance: string | null }>(
      `select * from public.requeue_enrichment($1, $2, $3)`,
      [id, userId, `  ${'shorter '.repeat(40)}  `],
    );
    expect(first.rows[0]!.pitch_guidance!.length).toBeLessThanOrEqual(200);
    expect(first.rows[0]!.pitch_guidance!.startsWith('shorter')).toBe(true);

    const second = await db.query<{ pitch_guidance: string | null }>(
      `select * from public.requeue_enrichment($1, $2)`,
      [id, userId],
    );
    expect(second.rows[0]!.pitch_guidance).toBeNull();
  });

  it('shows the guidance to the writer through the snapshot', async () => {
    const { id, userId } = await detailedSession();
    await db.query(`select public.requeue_enrichment($1, $2, 'Warmer')`, [id, userId]);
    const { rows } = await db.query<{ snap: { session: { pitch_guidance: string } } }>(
      `select public.enrichment_snapshot($1) as snap`,
      [id],
    );
    expect(rows[0]!.snap.session.pitch_guidance).toBe('Warmer');
  });

  it("refuses another rep's session", async () => {
    const { id } = await detailedSession();
    const stranger = await seedFixture(db, { cards: 0 });
    await expect(
      db.query(`select public.requeue_enrichment($1, $2, 'x')`, [id, stranger.userId]),
    ).rejects.toThrow(/session_not_found/);
  });
});

describe('playbook_entries', () => {
  const insert = (userId: string, problem: string, extra = '') =>
    db.query(
      `insert into public.playbook_entries(user_id, problem, why, checks, resource_url) values ($1, $2, 'Because.', $3, ${extra || 'null'})`,
      [userId, problem, ['a', 'b']],
    );

  it('keeps one entry per problem per rep, ignoring case', async () => {
    const { userId } = await seedFixture(db, { cards: 0 });
    await insert(userId, 'Late revaluations');
    await expect(insert(userId, 'late REVALUATIONS')).rejects.toThrow();
    const other = await seedFixture(db, { cards: 0 });
    await expect(insert(other.userId, 'Late revaluations')).resolves.toBeTruthy();
  });

  it('allows at most three checks and only an https resource', async () => {
    const { userId } = await seedFixture(db, { cards: 0 });
    await expect(
      db.query(
        `insert into public.playbook_entries(user_id, problem, checks) values ($1, 'P1', $2)`,
        [userId, ['1', '2', '3', '4']],
      ),
    ).rejects.toThrow();
    await expect(insert(userId, 'P2', `'http://insecure.example'`)).rejects.toThrow();
    await expect(insert(userId, 'P3', `'https://ok.example/guide'`)).resolves.toBeTruthy();
  });
});
