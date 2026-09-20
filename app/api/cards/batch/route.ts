import { randomBytes } from 'node:crypto';
import { fail, json, readJson, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { generateCodes } from '@/lib/domain/codes';
import { cardBatchSchema } from '@/lib/schemas/sessions';

/**
 * POST /api/cards/batch — generate N codes (spec §15.2).
 *
 * The codes produced here are written to NTAG215 chips and handed to strangers.
 * Tags are immutable and cannot be re-pointed, so `cards` is one of the two
 * tables that can never be regenerated (§24.4). Everything about this route is
 * shaped by that: cryptographic randomness, rejection sampling, a unique
 * constraint in the database, and a retry rather than a silent partial insert.
 */
export const POST = withRep(async (rep, request) => {
  const parsed = cardBatchSchema.safeParse(await readJson(request));

  if (!parsed.success) {
    return fail('invalid_request', 400, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { size, label } = parsed.data;
  const db = serviceClient();

  const { data: batch, error: batchError } = await db
    .from('card_batches')
    .insert({ user_id: rep.userId, label: label ?? null, size })
    .select('id, label, size, created_at')
    .single();

  if (batchError || !batch) {
    throw new Error(`could not create batch: ${batchError?.message}`);
  }

  // crypto.randomBytes with rejection sampling (§22.1). The domain function owns
  // the alphabet and the bias handling; this owns the entropy source.
  const random = (bytes: number) => new Uint8Array(randomBytes(bytes));

  // A collision at 8 characters is vanishingly unlikely, but the unique index is
  // the real guard and a retry is cheaper than an apology. Three attempts is
  // already far beyond what chance requires.
  let inserted: { code: string }[] | null = null;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 3 && inserted === null; attempt++) {
    const codes = generateCodes(random, size);

    const { data, error } = await db
      .from('cards')
      .insert(codes.map((code) => ({ user_id: rep.userId, batch_id: batch.id, code })))
      .select('code');

    if (error) {
      lastError = error.message;
      continue;
    }
    inserted = data;
  }

  if (inserted === null) {
    // Leave no half-made batch behind for someone to find later.
    await db.from('card_batches').delete().eq('id', batch.id);
    throw new Error(`could not generate ${size} unique codes: ${lastError}`);
  }

  return json({ batch, codes: inserted.map((row) => row.code) }, { status: 201 });
});
