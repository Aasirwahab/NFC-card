import 'server-only';
import { serviceClient } from '@/lib/db/service';
import type { Json } from '@/lib/db/types';

/**
 * Every operator write leaves a row here: who did it, to whom, and to which card.
 * A failed audit write must not block the work (the card is already issued), so it
 * is logged loudly instead of thrown.
 */
export async function audit(entry: {
  actor: string;
  action: string;
  userId?: string | null;
  code?: string | null;
  meta?: Record<string, Json>;
}): Promise<void> {
  const { error } = await serviceClient()
    .from('staff_audit_log')
    .insert({
      actor_email: entry.actor,
      action: entry.action,
      target_user_id: entry.userId ?? null,
      target_code: entry.code ?? null,
      meta: entry.meta ?? {},
    });
  if (error) {
    console.error(
      JSON.stringify({ event: 'audit_failed', action: entry.action, error: error.message }),
    );
  }
}
