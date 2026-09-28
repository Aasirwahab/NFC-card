-- TapLead — Phase 7: no-tap follow-up, session deletion, retention (spec §19.3, §23, §26)
--
--   queue_no_tap_followups  from the minute cron: one followup job for each live,
--                           detailed session nobody has opened 24 hours after
--                           registration. Idempotent: the job's live-per-session
--                           index and followup_drafts' unique index mean running
--                           it twice produces one draft.
--   save_followup_draft     the job's commit: one draft per session, ever.
--   mark_followup_sent      the rep sent it by hand (drafts are never sent for them).
--   delete_session          a prospect asks to be forgotten, or the rep removes a
--                           lead: the session and everything hanging off it goes,
--                           bookings included (they carry the prospect's name and
--                           email). The card is voided: it may be in someone's
--                           pocket and must never be registered to a second person.
--   purge_expired_sessions  retention (§23): sessions with no activity for
--                           p_months and no live booking are deleted the same
--                           way. Run daily.

create function public.queue_no_tap_followups(p_now timestamptz default now())
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
     and s.registered_at <  p_now - interval '24 hours'
     -- Not for sessions from long before this feature existed.
     and s.registered_at >= p_now - interval '30 days'
     and not exists (select 1 from public.followup_drafts d where d.session_id = s.id)
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $fn$;

create function public.save_followup_draft(
  p_session_id uuid,
  p_channel    text,
  p_text       text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_inserted int;
begin
  insert into public.followup_drafts(session_id, channel, draft_text)
  values (p_session_id, p_channel, p_text)
  on conflict (session_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    insert into public.session_events(session_id, type, meta)
    values (p_session_id, 'followup_drafted', jsonb_build_object('channel', p_channel));
  end if;
  return v_inserted = 1;
end $fn$;

create function public.mark_followup_sent(p_session_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_updated int;
begin
  update public.followup_drafts d
     set sent_at = coalesce(d.sent_at, now())
    from public.sessions s
   where d.session_id = p_session_id
     and s.id = d.session_id
     and s.user_id = p_user_id;

  get diagnostics v_updated = row_count;
  if v_updated = 1 then
    insert into public.session_events(session_id, type) values (p_session_id, 'followup_sent');
  end if;
  return v_updated = 1;
end $fn$;

create function public.delete_session(p_session_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_card uuid;
begin
  select card_id into v_card
    from public.sessions
   where id = p_session_id and user_id = p_user_id
   for update;

  if not found then
    return false;
  end if;

  -- bookings.session_id is ON DELETE SET NULL, which would leave the prospect's
  -- name and email behind. Deletion means deletion.
  delete from public.bookings where session_id = p_session_id;
  -- chat_messages, session_events, followup_drafts, pitch_ratings and jobs cascade.
  delete from public.sessions where id = p_session_id;

  update public.cards set status = 'voided' where id = v_card;
  return true;
end $fn$;

create index bookings_live_session on public.bookings(session_id)
  where status in ('confirmed', 'rescheduled');

create function public.purge_expired_sessions(p_months int, p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ids   uuid[];
  v_cards uuid[];
begin
  if p_months is null or p_months < 1 then
    raise exception 'retention must be at least one month';
  end if;

  select array_agg(s.id), array_agg(s.card_id)
    into v_ids, v_cards
    from public.sessions s
   where greatest(s.updated_at, s.registered_at, coalesce(s.first_viewed_at, s.registered_at))
         < p_now - make_interval(months => p_months)
     and not exists (
       select 1 from public.bookings b
        where b.session_id = s.id
          and b.status in ('confirmed', 'rescheduled')
     );

  if v_ids is null then
    return 0;
  end if;

  delete from public.bookings where session_id = any(v_ids);
  delete from public.sessions where id = any(v_ids);
  update public.cards set status = 'voided' where id = any(v_cards) and status <> 'voided';

  return cardinality(v_ids);
end $fn$;

revoke execute on function public.queue_no_tap_followups(timestamptz)   from public, anon, authenticated;
revoke execute on function public.save_followup_draft(uuid, text, text)  from public, anon, authenticated;
revoke execute on function public.mark_followup_sent(uuid, uuid)         from public, anon, authenticated;
revoke execute on function public.delete_session(uuid, uuid)             from public, anon, authenticated;
revoke execute on function public.purge_expired_sessions(int, timestamptz) from public, anon, authenticated;

grant execute on function public.queue_no_tap_followups(timestamptz)   to service_role;
grant execute on function public.save_followup_draft(uuid, text, text)  to service_role;
grant execute on function public.mark_followup_sent(uuid, uuid)         to service_role;
grant execute on function public.delete_session(uuid, uuid)             to service_role;
grant execute on function public.purge_expired_sessions(int, timestamptz) to service_role;
