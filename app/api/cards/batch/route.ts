import { randomBytes } from 'node:crypto';
import { fail, json, readJson, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { issueBatch } from '@/lib/cards/issue-batch';
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

  // crypto.randomBytes with rejection sampling (§22.1). The domain function owns
  // the alphabet and the bias handling; this owns the entropy source.
  const random = (bytes: number) => new Uint8Array(randomBytes(bytes));

  const { batch, codes } = await issueBatch(serviceClient(), {
    userId: rep.userId,
    size,
    label: label ?? null,
    random,
  });

  return json({ batch, codes }, { status: 201 });
});
