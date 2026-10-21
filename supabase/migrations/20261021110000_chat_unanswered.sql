-- Questions the assistant handed back to the rep. No private session notes.
create table public.chat_unanswered (
  id          bigserial primary key,
  session_id  uuid not null references public.sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  question    text not null check (char_length(question) <= 500),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index chat_unanswered_user_open on public.chat_unanswered(user_id, resolved_at, created_at);
create index chat_unanswered_session on public.chat_unanswered(session_id);

alter table public.chat_unanswered enable row level security;

create policy chat_unanswered_select on public.chat_unanswered
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy chat_unanswered_resolve on public.chat_unanswered
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Visitors cannot read or insert via the Data API. The chat route holds the
-- service role; a rep may only read and change the resolution timestamp.
revoke all on public.chat_unanswered from public, anon, authenticated;
revoke all on sequence public.chat_unanswered_id_seq from public, anon, authenticated;
grant select, update (resolved_at) on public.chat_unanswered to authenticated;
grant all on public.chat_unanswered to service_role;
grant usage, select on sequence public.chat_unanswered_id_seq to service_role;

-- Save through Setup's knowledge action. Appending the answer and resolving the
-- question succeed together; a retry cannot append the same answer twice.
create function public.answer_chat_question(p_id bigint, p_user_id uuid, p_answer text, p_topic text default 'faq')
returns void
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_question text;
  v_knowledge_id uuid;
  v_content text;
begin
  if p_answer is null or btrim(p_answer) = '' then
    raise exception 'invalid_answer';
  end if;
  if p_topic is null or p_topic not in ('services', 'pricing', 'faq', 'about', 'niche', 'timeline', 'proof') then
    raise exception 'invalid_topic';
  end if;

  -- Serialize answers even when the rep's first entry for this topic does not exist.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_topic, 0));

  select question into v_question from public.chat_unanswered
   where id = p_id and user_id = p_user_id and resolved_at is null
   for update;
  if not found then raise exception 'question_not_found'; end if;

  select id, content into v_knowledge_id, v_content from public.knowledge_base
   where user_id = p_user_id and topic = p_topic and source = 'manual'
   order by created_at limit 1 for update;

  v_content := concat_ws(E'\n\n', nullif(btrim(v_content), ''), v_question || E'\n' || btrim(p_answer));
  if char_length(v_content) > 20000 then raise exception 'knowledge_too_long'; end if;

  if v_knowledge_id is null then
    insert into public.knowledge_base(user_id, topic, content)
    values (p_user_id, p_topic, v_content);
  else
    update public.knowledge_base set content = v_content where id = v_knowledge_id;
  end if;

  update public.chat_unanswered set resolved_at = now() where id = p_id;
end $fn$;

revoke all on function public.answer_chat_question(bigint, uuid, text, text) from public, anon, authenticated;
grant execute on function public.answer_chat_question(bigint, uuid, text, text) to service_role;
