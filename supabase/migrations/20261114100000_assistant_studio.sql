-- Assistant settings, grounded sources, and the rep's answer loop. Additive only.
-- Rollback SQL (saved answers and settings would be removed):
-- drop function public.record_assistant_turn(uuid, text, text, text[]);
-- drop function public.answer_assistant_question(bigint, uuid, text, text, text);
-- alter table public.chat_messages drop column source_topics;
-- alter table public.chat_unanswered drop column handed_off, drop column saved_answer;
-- alter table public.profiles drop column assistant_blocked_topics;

alter table public.profiles
  add column assistant_blocked_topics text[] not null default '{}'
  check (cardinality(assistant_blocked_topics) <= 9);

alter table public.chat_messages
  add column source_topics text[] not null default '{}'
  check (source_topics <@ array['services', 'pricing', 'faq', 'about', 'niche', 'timeline', 'proof']::text[]);

alter table public.chat_unanswered
  add column handed_off boolean not null default false,
  add column saved_answer text check (char_length(saved_answer) <= 20000);

-- The established RPC owns the question lock, topic lock, cap, and ownership
-- check. This wrapper keeps the exact rep-written send draft in that transaction.
create function public.answer_assistant_question(
  p_id bigint,
  p_user_id uuid,
  p_public_question text,
  p_answer text,
  p_topic text default 'faq'
) returns void
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  perform public.answer_chat_question(p_id, p_user_id, p_public_question, p_answer, p_topic);
  update public.chat_unanswered set saved_answer = p_answer
   where id = p_id and user_id = p_user_id;
end $fn$;

revoke all on function public.answer_assistant_question(bigint, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.answer_assistant_question(bigint, uuid, text, text, text) to service_role;

-- Keep the old logger for existing callers. Both chat rows and the event commit
-- together. Only the authenticated server's service client may call this RPC.
create function public.record_assistant_turn(
  p_session_id uuid,
  p_question text,
  p_answer text,
  p_source_topics text[] default '{}'
) returns void
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  insert into public.chat_messages(session_id, role, content)
  values (p_session_id, 'user', p_question);

  insert into public.chat_messages(session_id, role, content, source_topics)
  values (p_session_id, 'assistant', p_answer, p_source_topics);

  insert into public.session_events(session_id, type)
  values (p_session_id, 'chat_turn');
end $fn$;

revoke all on function public.record_assistant_turn(uuid, text, text, text[]) from public, anon, authenticated;
grant execute on function public.record_assistant_turn(uuid, text, text, text[]) to service_role;
