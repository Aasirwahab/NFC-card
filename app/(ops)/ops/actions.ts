'use server';

import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/staff';
import { serviceClient } from '@/lib/db/service';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import { issueBatch } from '@/lib/cards/issue-batch';
import { audit } from '@/lib/ops/audit';

/**
 * Operator actions. Each one re-checks the staff gate itself: a server action is
 * a public POST endpoint, so the layout's check does not protect it.
 */

const issueSchema = z.object({
  userId: z.uuid(),
  count: z.coerce.number().int().min(1).max(200),
  label: z.string().trim().max(80).optional(),
});

export async function issueBatchAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const parsed = issueSchema.safeParse({
    userId: formData.get('userId'),
    count: formData.get('count'),
    label: formData.get('label') || undefined,
  });
  if (!parsed.success) redirect(`/ops?error=invalid_batch`);

  const { userId, count, label } = parsed.data;
  const db = serviceClient();

  const { data: exists } = await db.auth.admin.getUserById(userId);
  if (!exists?.user) redirect(`/ops?error=user_not_found`);

  const { batch, codes } = await issueBatch(db, {
    userId,
    size: count,
    label: label || null,
    random: (n) => new Uint8Array(randomBytes(n)),
  });

  await audit({
    actor: staff.email,
    action: 'issue_batch',
    userId,
    meta: { batchId: batch.id, count: codes.length, label: label ?? null },
  });

  redirect(`/ops/batches/${batch.id}`);
}

const codeSchema = z.object({
  code: z.string().transform(normaliseCode).refine(isValidCode),
  batchId: z.uuid(),
});

/** The sticker has been written; the next tap by staff will verify it. */
export async function markWrittenAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const parsed = codeSchema.safeParse({
    code: formData.get('code'),
    batchId: formData.get('batchId'),
  });
  if (!parsed.success) return;

  const { error } = await serviceClient()
    .from('cards')
    .update({ written_at: new Date().toISOString() })
    .eq('code', parsed.data.code)
    .eq('status', 'available')
    .is('written_at', null);
  if (!error) await audit({ actor: staff.email, action: 'mark_written', code: parsed.data.code });
  revalidatePath(`/ops/batches/${parsed.data.batchId}`);
}

/** For a sticker that checked out some other way (another phone read it). */
export async function markVerifiedAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const parsed = codeSchema.safeParse({
    code: formData.get('code'),
    batchId: formData.get('batchId'),
  });
  if (!parsed.success) return;

  const now = new Date().toISOString();
  const { data } = await serviceClient()
    .from('cards')
    .update({ verified_at: now })
    .eq('code', parsed.data.code)
    .eq('status', 'available')
    .is('verified_at', null)
    .select('code');
  await serviceClient()
    .from('cards')
    .update({ written_at: now })
    .eq('code', parsed.data.code)
    .is('written_at', null);
  if (data?.length) {
    await audit({
      actor: staff.email,
      action: 'mark_verified',
      code: parsed.data.code,
      meta: { by: 'hand' },
    });
  }
  revalidatePath(`/ops/batches/${parsed.data.batchId}`);
}

/** Wrong write, or the sticker was damaged: take it back to "needs writing". */
export async function resetCardAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const parsed = codeSchema.safeParse({
    code: formData.get('code'),
    batchId: formData.get('batchId'),
  });
  if (!parsed.success) return;

  await serviceClient()
    .from('cards')
    .update({ written_at: null, verified_at: null })
    .eq('code', parsed.data.code)
    .eq('status', 'available');
  await audit({ actor: staff.email, action: 'reset_card', code: parsed.data.code });
  revalidatePath(`/ops/batches/${parsed.data.batchId}`);
}
