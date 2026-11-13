-- INSIGNAR: "Follow up today" state on the session.
--
-- The list on Today is derived from sessions, session events and bookings, so it
-- needs no cron and no stored draft. Two facts the rep tells us have nowhere to
-- live yet:
--   * followup_sent_at : the rep confirmed they sent a follow-up by hand.
--   * followup_outcome : how it ended. 'replied' or 'dropped'. A dropped or
--                        replied lead never gets another draft.
-- Additive. Existing sessions keep working; sent drafts are backfilled below.

alter table public.sessions
  add column followup_sent_at timestamptz,
  add column followup_outcome text check (followup_outcome in ('replied', 'dropped'));

update public.sessions s
   set followup_sent_at = d.sent_at
  from public.followup_drafts d
 where d.session_id = s.id
   and d.sent_at is not null;

-- The rep sent it by hand. No draft row is needed any more, and a second call
-- records nothing new: one event, the first timestamp. True means "your lead".
create or replace function public.mark_followup_sent(p_session_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_updated int;
begin
  update public.sessions
     set followup_sent_at = now()
   where id = p_session_id
     and user_id = p_user_id
     and status = 'active'
     and followup_sent_at is null;

  get diagnostics v_updated = row_count;
  if v_updated = 1 then
    insert into public.session_events(session_id, type) values (p_session_id, 'followup_sent');
  end if;

  -- Keep the draft row from the no-tap job in step, if there is one.
  update public.followup_drafts
     set sent_at = coalesce(sent_at, now())
   where session_id = p_session_id
     and exists (
       select 1 from public.sessions s
        where s.id = p_session_id and s.user_id = p_user_id and s.status = 'active'
     );

  return exists (
    select 1 from public.sessions
     where id = p_session_id and user_id = p_user_id and status = 'active'
  );
end $fn$;

-- Nothing is drafted for a lead the rep already followed up, or closed.
create or replace function public.queue_no_tap_followups(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_count int;
begin
  insert into public.jobs(type, session_id, user_id)
  select 'followup', s.id, s.user_id
    from public.sessions s
   where s.status = 'active'
     and s.first_viewed_at is null
     and s.details_completed_at is not null
     and s.followup_sent_at is null
     and s.followup_outcome is null
     and s.registered_at <  p_now - interval '24 hours'
     -- Not for sessions from long before this feature existed.
     and s.registered_at >= p_now - interval '30 days'
     and not exists (select 1 from public.followup_drafts d where d.session_id = s.id)
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $fn$;
