import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, seedFixture, type TestDb } from './harness';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

async function question() {
  const { userId, codes } = await seedFixture(db, { cards: 1 });
  const sessionId = crypto.randomUUID();
  await db.query(`select public.tap_register_card($1, $2, $3, 'rep')`, [
    sessionId,
    codes[0],
    userId,
  ]);
  const result = await db.query<{ id: number }>(
    `insert into public.chat_unanswered(session_id, user_id, question, handed_off) values ($1, $2, 'How long?', true) returning id`,
    [sessionId, userId],
  );
  return { userId, sessionId, id: result.rows[0]!.id };
}

describe('assistant studio migration', () => {
  it('appends a handed-off answer and saves the exact send text atomically', async () => {
    const row = await question();
    await db.query(
      `insert into public.knowledge_base(user_id, topic, content) values ($1, 'timeline', 'Existing.')`,
      [row.userId],
    );
    await db.query(
      `select public.answer_assistant_question($1,$2,'How long does setup take?',$3,'timeline')`,
      [row.id, row.userId, '  Two weeks.\n\nAsk me.  '],
    );
    expect(
      (await db.query(`select content from public.knowledge_base where user_id = $1`, [row.userId]))
        .rows,
    ).toEqual([{ content: 'Existing.\n\nHow long does setup take?\nTwo weeks.\n\nAsk me.' }]);
    expect(
      (
        await db.query(
          `select handed_off, saved_answer, resolved_at is not null as answered from public.chat_unanswered where id = $1`,
          [row.id],
        )
      ).rows,
    ).toEqual([{ handed_off: true, saved_answer: '  Two weeks.\n\nAsk me.  ', answered: true }]);
    await expect(
      db.query(`select public.answer_assistant_question($1,$2,'How long?','Again')`, [
        row.id,
        row.userId,
      ]),
    ).rejects.toThrow(/question_not_found/);
  });

  it('leaves knowledge and question unchanged for another owner or a full topic', async () => {
    const row = await question();
    const other = await seedFixture(db, { cards: 0 });
    await expect(
      db.query(`select public.answer_assistant_question($1,$2,'How long?','Two weeks.')`, [
        row.id,
        other.userId,
      ]),
    ).rejects.toThrow(/question_not_found/);
    await db.query(
      `insert into public.knowledge_base(user_id, topic, content) values ($1, 'faq', $2)`,
      [row.userId, 'x'.repeat(19999)],
    );
    await expect(
      db.query(`select public.answer_assistant_question($1,$2,'How long?','Two weeks.')`, [
        row.id,
        row.userId,
      ]),
    ).rejects.toThrow(/knowledge_too_long/);
    expect(
      (
        await db.query(`select saved_answer, resolved_at from public.chat_unanswered where id=$1`, [
          row.id,
        ])
      ).rows,
    ).toEqual([{ saved_answer: null, resolved_at: null }]);
    expect(
      (
        await db.query(
          `select char_length(content) as length from public.knowledge_base where user_id=$1`,
          [row.userId],
        )
      ).rows,
    ).toEqual([{ length: 19999 }]);
  });

  it('records grounded source topics and refuses unknown topics without partial logging', async () => {
    const row = await question();
    await db.query(
      `select public.record_assistant_turn($1,'How long?','Two weeks.',array['timeline'])`,
      [row.sessionId],
    );
    expect(
      (
        await db.query(
          `select role, source_topics from public.chat_messages where session_id=$1 order by id`,
          [row.sessionId],
        )
      ).rows,
    ).toEqual([
      { role: 'user', source_topics: [] },
      { role: 'assistant', source_topics: ['timeline'] },
    ]);
    await expect(
      db.query(`select public.record_assistant_turn($1,'Another?','Made up.',array['invented'])`, [
        row.sessionId,
      ]),
    ).rejects.toThrow(/check constraint/);
    expect(
      (
        await db.query(
          `select count(*)::int as count from public.chat_messages where session_id=$1`,
          [row.sessionId],
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
  });

  it('allows only the service role to call the new write functions', async () => {
    const { rows } = await db.query(
      `select r, has_function_privilege(r, 'public.answer_assistant_question(bigint, uuid, text, text, text)', 'execute') as answer, has_function_privilege(r, 'public.record_assistant_turn(uuid, text, text, text[])', 'execute') as record from unnest(array['anon','authenticated','service_role']) r`,
    );
    expect(rows).toEqual([
      { r: 'anon', answer: false, record: false },
      { r: 'authenticated', answer: false, record: false },
      { r: 'service_role', answer: true, record: true },
    ]);
  });
});
