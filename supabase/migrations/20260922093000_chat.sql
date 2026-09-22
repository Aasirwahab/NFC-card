-- The chatbot (spec §18, Phase 5).

-- ------------------------------------------------------ claim_chat_response

-- §18.1: five assistant responses per session, claimed atomically BEFORE the
-- model call, so a burst of concurrent requests cannot exceed the cap. A
-- client-side counter is decoration; this is the control.
--
-- Returns the number of responses used, including this one, or null when the
-- cap is reached (or the session is not live) — the route then serves the
-- static answer instead of calling the model.
create function public.claim_chat_response(p_session_id uuid, p_cap int default 5)
returns int
language sql
security definer
set search_path = public, pg_temp
as $fn$
  update public.sessions
     set chat_response_count = chat_response_count + 1
   where id = p_session_id
     and status = 'active'
     and chat_response_count < p_cap
  returning chat_response_count;
$fn$;

-- ---------------------------------------------------- release_chat_response

-- Hands a claim back when the model call failed, so an outage does not spend
-- the prospect's questions. Never takes the count below zero.
create function public.release_chat_response(p_session_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $fn$
  update public.sessions
     set chat_response_count = chat_response_count - 1
   where id = p_session_id
     and chat_response_count > 0;
$fn$;

-- ---------------------------------------------------------- record_chat_turn

-- §18.2: log every turn, so the rep can read what was said before the call. The
-- question and the answer are written together or not at all.
create function public.record_chat_turn(
  p_session_id uuid,
  p_question   text,
  p_answer     text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.chat_messages(session_id, role, content)
  values (p_session_id, 'user', p_question);

  insert into public.chat_messages(session_id, role, content)
  values (p_session_id, 'assistant', p_answer);

  insert into public.session_events(session_id, type)
  values (p_session_id, 'chat_turn');
end $fn$;

-- Messages are bounded where they are stored, not only where they are typed.
alter table public.chat_messages
  add constraint chat_messages_content_length check (char_length(content) <= 2000);

grant execute on function public.claim_chat_response(uuid, int)          to service_role;
grant execute on function public.release_chat_response(uuid)             to service_role;
grant execute on function public.record_chat_turn(uuid, text, text)      to service_role;
