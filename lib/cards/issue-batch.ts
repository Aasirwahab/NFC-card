import type { SupabaseClient } from '@supabase/supabase-js';
import { generateCodes } from '@/lib/domain/codes';
import type { Database } from '@/lib/db/types';

/**
 * Create a batch of card codes owned by one rep. Shared by the API route and the
 * operator script, so both get the same guarantees.
 *
 * The codes are written to NTAG215 chips and handed to strangers, and a tag cannot
 * be re-pointed, so `cards` is one of the two tables that can never be regenerated
 * (§24.4): cryptographic randomness (supplied by the caller), a unique constraint
 * in the database, and a retry rather than a silent partial insert.
 */
export async function issueBatch(
  db: SupabaseClient<Database>,
  input: {
    userId: string;
    size: number;
    label: string | null;
    random: (bytes: number) => Uint8Array;
  },
) {
  const { userId, size, label, random } = input;

  const { data: batch, error: batchError } = await db
    .from('card_batches')
    .insert({ user_id: userId, label, size })
    .select('id, label, size, created_at')
    .single();

  if (batchError || !batch) {
    throw new Error(`could not create batch: ${batchError?.message}`);
  }

  // A collision at 8 characters is vanishingly unlikely, but the unique index is
  // the real guard and a retry is cheaper than an apology.
  let inserted: { code: string }[] | null = null;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 3 && inserted === null; attempt++) {
    const codes = generateCodes(random, size);
    const { data, error } = await db
      .from('cards')
      .insert(codes.map((code) => ({ user_id: userId, batch_id: batch.id, code })))
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

  return { batch, codes: inserted.map((row) => row.code) };
}

/** `K7M3PQ2X` -> `K7M3-PQ2X`: the form printed on the card, easier to read and type. */
export function printedCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
