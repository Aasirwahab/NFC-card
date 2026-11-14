import { generateText, NoObjectGeneratedError, Output, type ModelMessage } from 'ai';
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
  fallbackReply,
  modelReplySchema,
  parseModelReply,
  type ModelReply,
  smallTalkReply,
  hasAvoidedPhrase,
  sourceLine,
} from '@/lib/chat/assistant';
import { isBlockedQuestion } from '@/lib/chat/blocked-topics';
import { blockedTopicsSchema } from '@/lib/chat/settings';
import { getRep } from '@/lib/db/server';
import { serviceClient } from '@/lib/db/service';
import { REP_DEVICE_COOKIE } from '@/lib/domain/audience';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import {
  redactContacts,
  routeKnownIntent,
  withoutHandedOffTurns,
  type ChatHistoryTurn,
} from '@/lib/chat/intent';
import { availableActions } from '@/lib/landing/actions';
import { emailConfigured } from '@/lib/email/mailer';
import { snapshotSchema } from '@/lib/enrich/snapshot';
import { env } from '@/lib/env';
import { checkRateLimit, clientIp, peekRateLimit } from '@/lib/security/rate-limit';

/**
 * POST /api/chat — the prospect page's assistant (spec §18).
 *
 *   200 { reply, remaining, sourceLine, outcome?, actionId? }            an answer, or the static cap message
 *   400 invalid_request                 404 not_found (says nothing about the code)
 *   403 owner_preview                   the rep's own preview never spends a question
 *   429 rate_limited                    502 chat_unavailable (the claim is handed back)
 *   503 chat_disabled                   the kill switch (§18.2)
 *
 * Authenticated {test:true,message} uses only the rep’s saved inputs and never writes chat data.
 * The model key never reaches the browser. The browser sends only the new
 * question: the history comes from chat_messages, so a client cannot invent
 * earlier assistant turns to steer the next one.
 */

export const dynamic = 'force-dynamic';
// The model call alone may take up to MODEL_TIMEOUT_MS; keep the function alive past it so a
// claimed question is always released.
export const maxDuration = 60;

const HISTORY_TURNS = 8;
const MODEL_TIMEOUT_MS = 20_000;

const requestSchema = z.object({
  code: z.string().trim().min(1).max(32).optional(),
  test: z.boolean().default(false),
  message: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
});

export async function POST(request: Request) {
  // §18.2: one env flag turns the chatbot off; the widget shows its static answer.
  if (!env.CHAT_ENABLED) return fail('chat_disabled', 503);

  const parsed = requestSchema.safeParse(await readJson(request));
  if (
    !parsed.success ||
    (!parsed.data.test && !parsed.data.code) ||
    (parsed.data.test && parsed.data.code)
  )
    return fail('invalid_request', 400);

  const testing = parsed.data.test;
  const db = serviceClient();
  let session: { id: string; user_id: string; chat_response_count: number } | null = null;
  let snapshot: ReturnType<typeof snapshotSchema.parse>;
  let blockedTopics: string[];

  if (testing) {
    const rep = await getRep();
    if (!rep) return fail('unauthenticated', 401);
    const limit = await checkRateLimit('assistantTest', rep.userId);
    if (!limit.allowed) return fail('rate_limited', 429);
    // Test inputs are always built from the signed-in rep, never a caller's code or user id.
    const [profile, business, knowledge] = await Promise.all([
      db
        .from('profiles')
        .select(
          'full_name, title, pitch_tone, pitch_avoid, booking_url, linkedin_url, assistant_blocked_topics',
        )
        .eq('id', rep.userId)
        .maybeSingle(),
      db
        .from('business_profiles')
        .select('company_name, tagline, website, services, pricing')
        .eq('user_id', rep.userId)
        .maybeSingle(),
      db
        .from('knowledge_base')
        .select('topic, content')
        .eq('user_id', rep.userId)
        .order('topic')
        .order('created_at'),
    ]);
    const rules = blockedTopicsSchema.safeParse(profile.data?.assistant_blocked_topics ?? []);
    if (!profile.data || profile.error || business.error || knowledge.error || !rules.success)
      return fail('chat_unavailable', 502);
    blockedTopics = rules.data;
    snapshot = snapshotSchema.parse({
      session: { id: rep.userId, user_id: rep.userId, status: 'active', details_revision: 0 },
      rep: profile.data,
      business: business.data,
      knowledge: knowledge.data,
    });
  } else {
    const code = normaliseCode(parsed.data.code!);
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
    const { data: card } = await db.from('cards').select('id').eq('code', code).maybeSingle();
    if (!card) return miss();
    const found = await db
      .from('sessions')
      .select('id, user_id, chat_response_count')
      .eq('card_id', card.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!found.data) return miss();
    session = found.data;
    const [rep, cookieStore] = await Promise.all([getRep(), cookies()]);
    if (
      rep?.userId === session.user_id ||
      cookieStore.get(REP_DEVICE_COOKIE)?.value === session.user_id
    )
      return fail('owner_preview', 403);
    const [raw, profile] = await Promise.all([
      db.rpc('enrichment_snapshot', { p_session_id: session.id }),
      db
        .from('profiles')
        .select('assistant_blocked_topics')
        .eq('id', session.user_id)
        .maybeSingle(),
    ]);
    const checkedSnapshot = snapshotSchema.safeParse(raw.data);
    const rules = blockedTopicsSchema.safeParse(profile.data?.assistant_blocked_topics ?? []);
    if (raw.error || !checkedSnapshot.success || !profile.data || profile.error || !rules.success) {
      console.error(JSON.stringify({ event: 'chat_snapshot_failed', sessionId: session.id }));
      return fail('chat_unavailable', 502);
    }
    snapshot = checkedSnapshot.data;
    blockedTopics = rules.data;
  }

  const actions = availableActions(snapshot, { emailEnabled: emailConfigured() });
  const context = chatContext(snapshot, actions);
  let historyUnavailable = false;
  async function readHistory(): Promise<ChatHistoryTurn[]> {
    if (!session) return [];
    const { data: history, error } = await db
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(HISTORY_TURNS * 2);
    if (error) historyUnavailable = true;
    return (history ?? [])
      .slice()
      .reverse()
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: redactContacts(m.content) }));
  }
  // Indirect follow-ups need the same conversation the answer model would see.
  const history = blockedTopics.length ? await readHistory() : null;
  if (historyUnavailable) return fail('chat_unavailable', 502);
  const smallTalk = smallTalkReply(parsed.data.message, context.repFirstName, context.businessName);
  const blocked =
    smallTalk === null &&
    (await isBlockedQuestion(parsed.data.message, blockedTopics, history ?? []));
  const intent = blocked ? null : routeKnownIntent(parsed.data.message, actions);
  // What we keep never contains a phone number or email the visitor typed.
  const storedQuestion = redactContacts(parsed.data.message);

  // A greeting or thanks is answered with fixed text and spends nothing (§18.1).
  if (blocked || smallTalk !== null || intent !== null) {
    // Once the five are used, a greeting must not invite another question.
    const remaining = Math.max(0, CHAT_CAP - (session?.chat_response_count ?? 0));
    // A fixed router answer costs nothing, so it is still given once the five are used.
    const reply = blocked
      ? `${context.repFirstName} will answer that one personally.`
      : intent
        ? intent.reply
        : remaining > 0
          ? smallTalk!
          : capReachedReply(context.repFirstName);
    // Logged like any turn, so the rep reads the whole conversation and the
    // model sees it as context for the next question.
    if (session) {
      const { error: logError } = await db.rpc('record_chat_turn', {
        p_session_id: session.id,
        p_question: storedQuestion,
        p_answer: reply,
      });
      if (logError) {
        console.error(
          JSON.stringify({
            event: 'chat_log_failed',
            sessionId: session.id,
            error: logError.message,
          }),
        );
      }
      if (blocked) {
        const { error } = await db.from('chat_unanswered').insert({
          session_id: session.id,
          user_id: session.user_id,
          question: storedQuestion.trim().slice(0, MAX_QUESTION_CHARS),
          handed_off: true,
        });
        if (error)
          console.error(JSON.stringify({ event: 'chat_unanswered_failed', sessionId: session.id }));
      }
    }
    return json({
      reply,
      remaining,
      sourceLine: null,
      ...(blocked ? { outcome: 'unknown', handedOff: true } : {}),
      ...(intent ? { outcome: intent.outcome, actionId: intent.action ?? undefined } : {}),
    });
  }

  let used = 0;
  let messages: ModelMessage[] = [];
  if (session) {
    // Claim before generating, so concurrent prospect questions cannot exceed the cap.
    const claim = await db.rpc('claim_chat_response', { p_session_id: session.id });
    if (claim.error) {
      console.error(JSON.stringify({ event: 'chat_claim_failed', sessionId: session.id }));
      return fail('chat_unavailable', 502);
    }
    if (claim.data === null)
      return json({ reply: capReachedReply(context.repFirstName), remaining: 0, sourceLine: null });
    used = claim.data;
    messages = withoutHandedOffTurns(history ?? (await readHistory()));
  }
  messages.push({ role: 'user', content: redactContacts(parsed.data.message) });

  let reply: ModelReply | null = null;
  let modelFailed = false;
  let refunded = false;
  let failureEvent = 'chat_model_failed';
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await generateText({
        model: modelFor('chat').model,
        instructions:
          chatInstructions(context) +
          (attempt
            ? '\nYour last reply contained an avoided phrase. Rewrite without any avoided words or phrases; preserve every other rule.'
            : ''),
        messages,
        output: Output.object({ schema: modelReplySchema }),
        abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      });
      // Reading output can itself throw when structured generation fails.
      failureEvent = 'chat_structured_output_failed';
      reply = parseModelReply(result.output);
      if (!reply || !hasAvoidedPhrase(reply.reply, context)) break;
    }
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) failureEvent = 'chat_structured_output_failed';
    // No raw provider errors: they may contain visitor data or the prompt.
    modelFailed = true;
    reply = null;
  }
  if (!reply) {
    modelFailed = true;
    if (session) {
      const { error: releaseError } = await db.rpc('release_chat_response', {
        p_session_id: session.id,
      });
      refunded = !releaseError;
    }
    console.error(JSON.stringify({ event: failureEvent, sessionId: session?.id }));
    reply = { outcome: 'unknown', reply: fallbackReply(context), action: null };
  }

  const checked = checkReply(reply, context);
  if (!checked.ok) {
    console.warn(
      JSON.stringify({
        event: 'chat_reply_replaced',
        sessionId: session?.id,
        failures: checked.failures.map((f) => f.check),
      }),
    );
  }

  if (session) {
    const { error: logError } = await db.rpc(
      checked.topics.length ? 'record_assistant_turn' : 'record_chat_turn',
      {
        p_session_id: session.id,
        p_question: storedQuestion,
        p_answer: checked.text,
        ...(checked.topics.length ? { p_source_topics: checked.topics } : {}),
      },
    );
    if (logError) {
      console.error(
        JSON.stringify({
          event: 'chat_log_failed',
          sessionId: session.id,
          error: logError.message,
        }),
      );
    }

    if (!modelFailed && (checked.outcome === 'unknown' || checked.outcome === 'partial')) {
      const { error } = await db.from('chat_unanswered').insert({
        session_id: session.id,
        user_id: session.user_id,
        question: storedQuestion.trim().slice(0, MAX_QUESTION_CHARS),
      });
      if (error) {
        console.error(JSON.stringify({ event: 'chat_unanswered_failed', sessionId: session.id }));
      }
    }
  }
  return json({
    reply: checked.text,
    sourceLine: sourceLine(context, checked),
    outcome: checked.outcome,
    remaining: testing
      ? CHAT_CAP
      : Math.max(0, CHAT_CAP - used + (modelFailed && refunded ? 1 : 0)),
    ...(checked.actionId ? { actionId: checked.actionId } : {}),
  });
}
