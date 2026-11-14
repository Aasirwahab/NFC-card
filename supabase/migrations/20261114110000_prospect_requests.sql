-- Rollback:
-- drop function public.mark_prospect_request_done(uuid, uuid, uuid);
-- drop function public.replace_prospect_request(uuid, text, text, text, text, text, text, text);
-- drop table public.prospect_requests;
-- No sessions or contact values are changed by this migration.

create table public.prospect_requests (
  id uuid primary key default gen_random_uuid(),
  -- Remove my details and retention both delete sessions; all request history goes too.
  session_id uuid not null references public.sessions(id) on delete cascade,
  kind text not null check (kind in ('call', 'details')),
  channel text not null check (channel in ('call', 'text', 'whatsapp', 'email')),
  contact_value text not null check (length(contact_value) between 1 and 254),
  best_time text check (best_time in ('today', 'tomorrow_morning', 'this_week')),
  consent_version text not null,
  consent_at timestamptz not null default now(),
  requester_token_hash text not null check (requester_token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'open' check (status in ('open', 'done', 'withdrawn')),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'done') = (done_at is not null)),
  check (case when channel = 'email'
    then contact_value = lower(contact_value) and contact_value ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    else contact_value ~ '^\+447[1-57-9][0-9]{8}$' end)
);

create unique index prospect_requests_one_open on public.prospect_requests(session_id)
  where status = 'open';
create index prospect_requests_session on public.prospect_requests(session_id, created_at desc);

alter table public.prospect_requests enable row level security;
create policy prospect_requests_owner_read on public.prospect_requests
  for select to authenticated using (exists (
    select 1 from public.sessions s
    where s.id = session_id and s.user_id = (select auth.uid())
  ));
revoke all on public.prospect_requests from public, anon, authenticated;
grant select on public.prospect_requests to authenticated;
grant all on public.prospect_requests to service_role;

-- The session lock serialises replacement, completion and contact deletion.
-- Tokens are generated and validated by the public route, never by a model.
create function public.replace_prospect_request(
  p_session_id uuid,
  p_kind text,
  p_channel text,
  p_contact_value text,
  p_best_time text,
  p_consent_version text,
  p_requester_token_hash text,
  p_answer_token_hash text
) returns public.prospect_requests
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_session public.sessions;
  v_request public.prospect_requests;
  v_answer_owner boolean;
begin
  select * into v_session from public.sessions
  where id = p_session_id and status = 'active' for update;
  if not found then raise exception 'request_not_ready' using errcode = 'P0002'; end if;
  if v_session.followup_outcome in ('dropped', 'replied') or exists (
    select 1 from public.bookings where session_id = p_session_id
    and status in ('confirmed', 'rescheduled')
  ) then raise exception 'request_closed' using errcode = 'P0001'; end if;
  if v_session.details_completed_at is null and
     (v_session.first_viewed_at is null or v_session.first_viewed_at <= now() - interval '24 hours') then
    raise exception 'request_not_ready' using errcode = 'P0002';
  end if;
  v_answer_owner := coalesce(v_session.prospect_answer_token_hash = p_answer_token_hash, false);
  if exists (select 1 from public.prospect_requests
             where session_id = p_session_id and status = 'open'
               and requester_token_hash <> p_requester_token_hash)
     and not v_answer_owner then
    raise exception 'request_given' using errcode = 'P0001';
  end if;
  update public.prospect_requests set status = 'withdrawn'
  where session_id = p_session_id and status = 'open';
  insert into public.prospect_requests
    (session_id, kind, channel, contact_value, best_time, consent_version, requester_token_hash)
  values
    (p_session_id, p_kind, p_channel, p_contact_value, p_best_time, p_consent_version, p_requester_token_hash)
  returning * into v_request;
  -- A new explicit request counts as activity for the existing retention clock.
  update public.sessions set updated_at = now() where id = p_session_id;
  return v_request;
end $fn$;

create function public.mark_prospect_request_done(
  p_session_id uuid, p_request_id uuid, p_user_id uuid
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  perform 1 from public.sessions
  where id = p_session_id and user_id = p_user_id and status = 'active' for update;
  if not found then return false; end if;
  update public.prospect_requests set status = 'done', done_at = now()
  where id = p_request_id and session_id = p_session_id and status = 'open';
  if found then
    update public.sessions set followup_sent_at = now() where id = p_session_id;
    return true;
  end if;
  return exists (select 1 from public.prospect_requests
                 where id = p_request_id and session_id = p_session_id and status = 'done');
end $fn$;

revoke execute on function public.replace_prospect_request(uuid, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.replace_prospect_request(uuid, text, text, text, text, text, text, text)
  to service_role;
revoke execute on function public.mark_prospect_request_done(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_prospect_request_done(uuid, uuid, uuid)
  to service_role;
