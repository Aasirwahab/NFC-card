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
  const { rows } = await db.query<{ id: number; resolved_at: string | null }>(
    `insert into public.chat_unanswered(session_id, user_id, question) values ($1, $2, 'How long?') returning id, resolved_at`,
    [sessionId, userId],
  );
  expect(rows[0]!.resolved_at).toBeNull();
  return { id: rows[0]!.id, sessionId, userId };
}

async function asRep<T>(userId: string, run: () => Promise<T>): Promise<T> {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  try {
    return await run();
  } finally {
    await db.exec('reset role');
  }
}

describe('chat_unanswered', () => {
  it("never copies the visitor's own words into shared knowledge", async () => {
    const row = await question();
    await db.query(
      `update public.chat_unanswered set question = 'Can Acme Ltd get 40% off our £2m contract?' where id = $1`,
      [row.id],
    );
    await db.query(
      `select public.answer_chat_question($1, $2, 'Do you offer discounts?', 'Ask Zaid.')`,
      [row.id, row.userId],
    );
    const { rows } = await db.query<{ content: string }>(
      `select content from public.knowledge_base where user_id = $1`,
      [row.userId],
    );
    expect(rows[0]!.content).toBe('Do you offer discounts?\nAsk Zaid.');
    expect(rows[0]!.content).not.toContain('Acme');
    await expect(
      db.query(`select public.answer_chat_question($1, $2, '  ', 'x')`, [row.id, row.userId]),
    ).rejects.toThrow();
  });

  it('saves a price answer under pricing so the chat guardrail can use it', async () => {
    const row = await question();
    await db.query(
      `select public.answer_chat_question($1, $2, 'What does it cost?', 'From £500.', 'pricing')`,
      [row.id, row.userId],
    );
    expect(
      (
        await db.query(`select topic, content from public.knowledge_base where user_id = $1`, [
          row.userId,
        ])
      ).rows,
    ).toEqual([{ topic: 'pricing', content: 'What does it cost?\nFrom £500.' }]);
  });

  it('appends an answer to manual FAQ knowledge and resolves atomically, without duplicates on retry', async () => {
    const row = await question();
    await db.query(
      `insert into public.knowledge_base(user_id, topic, content) values ($1, 'faq', 'Existing answer.')`,
      [row.userId],
    );
    await db.query(
      `select public.answer_chat_question($1, $2, 'How long does it take?', '  Two weeks.  ')`,
      [row.id, row.userId],
    );
    expect(
      (
        await db.query(
          `select content from public.knowledge_base where user_id = $1 and topic = 'faq'`,
          [row.userId],
        )
      ).rows,
    ).toEqual([{ content: 'Existing answer.\n\nHow long does it take?\nTwo weeks.' }]);
    expect(
      (
        await db.query(
          `select id from public.chat_unanswered where id = $1 and resolved_at is not null`,
          [row.id],
        )
      ).rows,
    ).toEqual([{ id: row.id }]);
    await expect(
      db.query(`select public.answer_chat_question($1, $2, 'How long does it take?', 'Again')`, [
        row.id,
        row.userId,
      ]),
    ).rejects.toThrow(/question_not_found/);
  });

  it('creates FAQ knowledge for a first answer and refuses another owner', async () => {
    const row = await question();
    const stranger = await seedFixture(db, { cards: 0 });
    await expect(
      db.query(
        `select public.answer_chat_question($1, $2, 'How long does it take?', 'Two weeks.')`,
        [row.id, stranger.userId],
      ),
    ).rejects.toThrow(/question_not_found/);
    await db.query(
      `select public.answer_chat_question($1, $2, 'How long does it take?', 'Two weeks.')`,
      [row.id, row.userId],
    );
    expect(
      (
        await db.query(`select topic, content from public.knowledge_base where user_id = $1`, [
          row.userId,
        ])
      ).rows,
    ).toEqual([{ topic: 'faq', content: 'How long does it take?\nTwo weeks.' }]);
  });

  it('keeps a question open and knowledge unchanged when an answer is blank or exceeds the topic limit', async () => {
    const row = await question();
    await db.query(
      `insert into public.knowledge_base(user_id, topic, content) values ($1, 'faq', $2)`,
      [row.userId, 'x'.repeat(19_990)],
    );
    for (const answer of ['  ', 'Two weeks.']) {
      await expect(
        db.query(`select public.answer_chat_question($1, $2, 'How long does it take?', $3)`, [
          row.id,
          row.userId,
          answer,
        ]),
      ).rejects.toThrow(/invalid_answer|knowledge_too_long/);
    }
    expect(
      (await db.query(`select resolved_at from public.chat_unanswered where id = $1`, [row.id]))
        .rows,
    ).toEqual([{ resolved_at: null }]);
    expect(
      (
        await db.query(
          `select char_length(content) as n from public.knowledge_base where user_id = $1`,
          [row.userId],
        )
      ).rows,
    ).toEqual([{ n: 19_990 }]);
  });

  it('bounds questions at 500 characters and cascades session deletion', async () => {
    const row = await question();
    await expect(
      db.query(
        `insert into public.chat_unanswered(session_id, user_id, question) values ($1, $2, $3)`,
        [row.sessionId, row.userId, 'x'.repeat(501)],
      ),
    ).rejects.toThrow(/check constraint/);
    await db.query(
      `insert into public.chat_unanswered(session_id, user_id, question) values ($1, $2, $3)`,
      [row.sessionId, row.userId, 'x'.repeat(500)],
    );
    await db.query(`delete from public.sessions where id = $1`, [row.sessionId]);
    expect(
      (
        await db.query(`select id from public.chat_unanswered where session_id = $1`, [
          row.sessionId,
        ])
      ).rows,
    ).toEqual([]);
  });

  it('lets only the owner read and resolve, without rewriting question or owner', async () => {
    const owner = await question();
    const stranger = await question();
    await asRep(owner.userId, async () => {
      expect((await db.query(`select id from public.chat_unanswered`)).rows).toEqual([
        { id: owner.id },
      ]);
      expect(
        (
          await db.query(
            `update public.chat_unanswered set resolved_at = now() where id = $1 returning id`,
            [stranger.id],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await db.query(
            `update public.chat_unanswered set resolved_at = now() where id = $1 returning id`,
            [owner.id],
          )
        ).rows,
      ).toEqual([{ id: owner.id }]);
      await expect(
        db.query(`update public.chat_unanswered set user_id = $1 where id = $2`, [
          stranger.userId,
          owner.id,
        ]),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query(`update public.chat_unanswered set question = 'changed' where id = $1`, [
          owner.id,
        ]),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it('grants insertion and sequence usage only to the service role; denies API deletes', async () => {
    const { rows } = await db.query<{
      role: string;
      insert: boolean;
      delete: boolean;
      sequence: boolean;
    }>(`
      select r as role,
             has_table_privilege(r, 'public.chat_unanswered', 'insert') as insert,
             has_table_privilege(r, 'public.chat_unanswered', 'delete') as delete,
             has_sequence_privilege(r, 'public.chat_unanswered_id_seq', 'usage') as sequence
        from unnest(array['anon', 'authenticated', 'service_role']) r order by r
    `);
    expect(rows).toEqual([
      { role: 'anon', insert: false, delete: false, sequence: false },
      { role: 'authenticated', insert: false, delete: false, sequence: false },
      { role: 'service_role', insert: true, delete: true, sequence: true },
    ]);
    const row = await question();
    await asRep(row.userId, async () => {
      await expect(
        db.query(
          `insert into public.chat_unanswered(session_id, user_id, question) values ($1, $2, 'Forged')`,
          [row.sessionId, row.userId],
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query(`delete from public.chat_unanswered where id = $1`, [row.id]),
      ).rejects.toThrow(/permission denied/);
    });
  });
});
