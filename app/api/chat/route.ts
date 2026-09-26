import { generateText, type ModelMessage } from 'ai';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { fail, json, readJson } from '@/lib/api';
import { modelFor } from '@/lib/ai/models';
import {
  CHAT_CAP,
  MAX_QUESTION_CHARS,
  capReachedReply,
  chatContext,
  chatInstructions,
  checkReply,
} from '@/lib/chat/assistant';
import { getRep } from '@/lib/db/server';
import { serviceClient } from '@/lib/db/service';
import { REP_DEVICE_COOKIE } from '@/lib/domain/audience';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import type { Research } from '@/lib/enrich/research';
import { snapshotSchema } from '@/lib/enrich/snapshot';
import { env } from '@/lib/env';
import { checkRateLimit, clientIp, peekRateLimit } from '@/lib/security/rate-limit';

/**
 * POST /api/chat — the prospect page's assistant (spec §18).
 *
 *   200 { reply, remaining }            an answer, or the static cap message
 *   400 invalid_request                 404 not_found (says nothing about the code)
 *   403 owner_preview                   the rep's own preview never spends a question
 *   429 rate_limited                    502 chat_unavailable (the claim is handed back)
 *   503 chat_disabled                   the kill switch (§18.2)
 *
 * The model key never reaches the browser. The browser sends only the new
 * question: the history comes from chat_messages, so a client cannot invent
 * earlier assistant turns to steer the next one.
 */

export const dynamic = 'force-dynamic';

const HISTORY_TURNS = 8;
const MODEL_TIMEOUT_MS = 20_000;

const requestSchema = z.object({
  code: z.string().trim().min(1).max(32),
  message: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
});

export async function POST(request: Request) {
  // §18.2: one env flag turns the chatbot off; the widget shows its static answer.
  if (!env.CHAT_ENABLED) return fail('chat_disabled', 503);

  const parsed = requestSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('invalid_request', 400);

  const code = normaliseCode(parsed.data.code);
  const ip = clientIp(await headers());
  const miss = async () => {
    await checkRateLimit('landingMiss', ip);
    return fail('not_found', 404);
  };

  if (!isValidCode(code)) return miss();

  const [limit, missesLeft] = await Promise.all([
    checkRateLimit('chat', ip),
    peekRateLimit('landingMiss', ip),
  ]);
  if (!limit.allowed || !missesLeft) return fail('rate_limited', 429);

  const db = serviceClient();

  const { data: card } = await db.from('cards').select('id').eq('code', code).maybeSingle();
  if (!card) return miss();

  const { data: session } = await db
    .from('sessions')
    .select('id, user_id, research')
    .eq('card_id', card.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!session) return miss();

  // The rep previewing their own page must not spend the prospect's questions —
  // signed in, or recognised by the rep-device cookie after the session expired.
  const [rep, cookieStore] = await Promise.all([getRep(), cookies()]);
  if (
    rep?.userId === session.user_id ||
    cookieStore.get(REP_DEVICE_COOKIE)?.value === session.user_id
  ) {
    return fail('owner_preview', 403);
  }

  const { data: rawSnapshot, error: snapshotError } = await db.rpc('enrichment_snapshot', {
    p_session_id: session.id,
  });
  const snapshot = snapshotSchema.safeParse(rawSnapshot);
  if (snapshotError || !snapshot.success) {
    console.error(JSON.stringify({ event: 'chat_snapshot_failed', sessionId: session.id }));
    return fail('chat_unavailable', 502);
  }

  const stored = session.research as Partial<Research> | null;
  // Same rule as the pitch (brief.ts): facts from an unconfirmed guessed site
  // may belong to a different company with the same name.
  const facts =
    stored?.domainSource !== 'guess' && Array.isArray(stored?.facts)
      ? stored.facts.filter((f): f is string => typeof f === 'string')
      : [];
  const context = chatContext(snapshot.data, facts);

  // §18.1: claim BEFORE the model call, so a burst cannot exceed the cap.
  const { data: used, error: claimError } = await db.rpc('claim_chat_response', {
    p_session_id: session.id,
  });
  if (claimError) throw new Error(`claim_chat_response failed: ${claimError.message}`);
  if (used === null) {
    return json({ reply: capReachedReply(context.repFirstName), remaining: 0 });
  }

  const { data: history } = await db
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', session.id)
    .order('created_at', { ascending: false })
    .limit(HISTORY_TURNS * 2);

  const messages: ModelMessage[] = [
    ...(history ?? [])
      .reverse()
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: parsed.data.message },
  ];

  let reply: string;
  try {
    const result = await generateText({
      model: modelFor('chat').model,
      instructions: chatInstructions(context),
      messages,
      abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
    reply = result.text;
  } catch (error) {
    // An outage must not spend the prospect's questions.
    await db.rpc('release_chat_response', { p_session_id: session.id });
    console.error(
      JSON.stringify({
        event: 'chat_model_failed',
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return fail('chat_unavailable', 502);
  }

  const checked = checkReply(reply, context);
  if (!checked.ok) {
    console.warn(
      JSON.stringify({
        event: 'chat_reply_replaced',
        sessionId: session.id,
        failures: checked.failures.map((f) => f.check),
      }),
    );
  }

  const { error: logError } = await db.rpc('record_chat_turn', {
    p_session_id: session.id,
    p_question: parsed.data.message,
    p_answer: checked.text,
  });
  if (logError) {
    console.error(
      JSON.stringify({ event: 'chat_log_failed', sessionId: session.id, error: logError.message }),
    );
  }

  return json({ reply: checked.text, remaining: Math.max(0, CHAT_CAP - used) });
}
