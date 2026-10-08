'use server';

import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/staff';
import { serviceClient } from '@/lib/db/service';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import { issueBatch } from '@/lib/cards/issue-batch';
import { profileSchema } from '@/lib/schemas/profile';
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
  batchId: z.union([z.uuid(), z.literal('')]).optional(),
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
  if (parsed.data.batchId) revalidatePath(`/ops/batches/${parsed.data.batchId}`);
  revalidatePath(`/ops/cards/${parsed.data.code}`);
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
  if (parsed.data.batchId) revalidatePath(`/ops/batches/${parsed.data.batchId}`);
  revalidatePath(`/ops/cards/${parsed.data.code}`);
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
  if (parsed.data.batchId) revalidatePath(`/ops/batches/${parsed.data.batchId}`);
  revalidatePath(`/ops/cards/${parsed.data.code}`);
}

// ---------------------------------------------------------------- user details

const userEditSchema = profileSchema.extend({
  userId: z.uuid(),
  low_stock_at: z.coerce.number().int().min(0).max(500),
});

/** Staff edit a rep's profile. The email and password are never touched here. */
export async function saveUserAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const parsed = userEditSchema.safeParse(Object.fromEntries(formData));
  const userId = String(formData.get('userId') ?? '');
  if (!parsed.success) redirect(`/ops/users/${userId}?error=invalid`);

  const { userId: id, ...fields } = parsed.data;
  const db = serviceClient();

  const { data: before } = await db.from('profiles').select('*').eq('id', id).maybeSingle();
  const { error } = await db.from('profiles').upsert({ id, ...fields }, { onConflict: 'id' });
  if (error) redirect(`/ops/users/${id}?error=save_failed`);

  // Field names only: the log must not become a second copy of personal details.
  const changed = Object.entries(fields)
    .filter(([key, value]) => (before as Record<string, unknown> | null)?.[key] !== value)
    .map(([key]) => key);
  await audit({ actor: staff.email, action: 'edit_user', userId: id, meta: { changed } });

  revalidatePath(`/ops/users/${id}`);
  redirect(`/ops/users/${id}?saved=1`);
}

// ------------------------------------------------------------------ card actions

async function ownerOf(code: string) {
  const { data } = await serviceClient()
    .from('cards')
    .select('user_id')
    .eq('code', code)
    .maybeSingle();
  return data?.user_id ?? null;
}

const cardOnlySchema = z.object({ code: z.string().transform(normaliseCode).refine(isValidCode) });

/** An unused card that is lost or damaged: void it so it can never be registered. */
export async function voidCardAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const parsed = cardOnlySchema.safeParse({ code: formData.get('code') });
  if (!parsed.success) redirect('/ops');
  const { code } = parsed.data;

  const owner = await ownerOf(code);
  if (!owner) redirect(`/ops?error=card_not_found`);

  const { error } = await serviceClient().rpc('mark_card_lost', {
    p_code: code,
    p_user_id: owner,
  });
  if (error)
    redirect(
      `/ops/cards/${code}?error=${error.message.includes('card_in_use') ? 'in_use' : 'failed'}`,
    );

  await audit({ actor: staff.email, action: 'void_card', userId: owner, code });
  revalidatePath(`/ops/cards/${code}`);
  redirect(`/ops/cards/${code}?done=voided`);
}

const reassignSchema = z.object({
  code: z.string().transform(normaliseCode).refine(isValidCode),
  userId: z.uuid(),
});

/** Move an unused card to another rep (e.g. sent to the wrong person). */
export async function reassignCardAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const parsed = reassignSchema.safeParse({
    code: formData.get('code'),
    userId: formData.get('userId'),
  });
  if (!parsed.success) redirect('/ops');
  const { code, userId } = parsed.data;

  const from = await ownerOf(code);
  const { error } = await serviceClient().rpc('ops_reassign_card', {
    p_code: code,
    p_new_user_id: userId,
  });
  if (error) {
    const reason = error.message.includes('card_in_use')
      ? 'in_use'
      : error.message.includes('user_not_found')
        ? 'no_user'
        : 'failed';
    redirect(`/ops/cards/${code}?error=${reason}`);
  }

  await audit({
    actor: staff.email,
    action: 'reassign_card',
    userId,
    code,
    meta: { from },
  });
  revalidatePath(`/ops/cards/${code}`);
  redirect(`/ops/cards/${code}?done=reassigned`);
}
