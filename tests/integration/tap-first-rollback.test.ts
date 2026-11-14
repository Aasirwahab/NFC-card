import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDb, seedFixture, type TestDb } from './harness';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

it('rolls back tap first in the documented order and restores the previous follow-up functions', async () => {
  for (const migration of [
    '20261113000000_prospect_answers.sql',
    '20261106090000_followup_state.sql',
  ]) {
    const header = readFileSync(`supabase/migrations/${migration}`, 'utf8').split('\n\n')[0]!;
    expect(header.startsWith('-- Rollback:')).toBe(true);
    const sql = header
      .split('\n')
      .slice(1)
      .filter((line) => !line.startsWith('-- Then restore'))
      .map((line) => line.replace(/^-- ?/, ''))
      .join('\n');
    await db.exec(sql);
  }
  const { rows } = await db.query(`select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'sessions'
      and (column_name like 'prospect_submitted_%' or column_name in
        ('last_viewed_at', 'prospect_picked_problems', 'prospect_consent_at', 'prospect_answer_token_hash', 'followup_sent_at', 'followup_outcome'))`);
  expect(rows).toEqual([]);
  const fixture = await seedFixture(db, { cards: 1 });
  const id = crypto.randomUUID();
  await db.query(`select * from public.register_card($1, $2, $3, $4, 'Tom', null)`, [
    id,
    fixture.codes[0],
    fixture.eventId,
    fixture.userId,
  ]);
  await db.query(`select public.save_session_details($1, $2, '{}'::jsonb)`, [id, fixture.userId]);
  await db.query(`select public.queue_no_tap_followups()`);
  await db.query(`select public.save_followup_draft($1, 'email', 'Hi Tom')`, [id]);
  const sent = await db.query<{ mark_followup_sent: boolean }>(
    'select public.mark_followup_sent($1, $2)',
    [id, fixture.userId],
  );
  expect(sent.rows[0]!.mark_followup_sent).toBe(true);
  const view = await db.query<{ record_prospect_view: boolean }>(
    'select public.record_prospect_view($1)',
    [id],
  );
  expect(view.rows[0]!.record_prospect_view).toBe(true);
});
