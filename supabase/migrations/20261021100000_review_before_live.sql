-- INSIGNAR: optional "review before it goes live".
--
-- Off (the default) keeps today's behaviour: the generated pitch is shown as soon
-- as it is written. On, a prospect sees the warm pending page until the rep
-- approves the pitch or writes their own (lib/domain/render-state.ts). The rep
-- chooses per account in Setup; nothing about it is decided by a model.
--   * profiles.review_before_live : the rep's choice.
--   * sessions.pitch_approved_at  : when the rep approved the current pitch. It only
--     counts for a finished pitch written before it; any newer run needs approving
--     again (heldForReview in lib/domain/render-state.ts).

alter table public.profiles
  add column review_before_live boolean not null default false;

alter table public.sessions
  add column pitch_approved_at timestamptz;

-- ------------------------------------------------------------ approve_pitch

-- Approves the session's current pitch, or withdraws the approval when
-- p_approved is false. Scoped by user_id, like every rep write (§22.6).
-- p_seen_completed_at is the enrichment_completed_at of the pitch the rep was
-- shown: if a newer pitch has landed since, nothing is approved ('pitch_changed').
create function public.approve_pitch(
  p_session_id         uuid,
  p_user_id            uuid,
  p_approved           boolean,
  p_seen_completed_at  timestamptz default null
) returns public.sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_session public.sessions;
begin
  update public.sessions s
     set pitch_approved_at = case when p_approved then now() else null end
   where s.id = p_session_id
     and s.user_id = p_user_id
     and s.status = 'active'
     and (not p_approved or s.enrichment_completed_at is not distinct from p_seen_completed_at)
  returning * into v_session;

  if not found then
    if p_approved and exists (
      select 1 from public.sessions s
       where s.id = p_session_id and s.user_id = p_user_id and s.status = 'active'
    ) then
      raise exception 'pitch_changed' using errcode = 'P0001';
    end if;
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  insert into public.session_events(session_id, type)
  values (p_session_id, case when p_approved then 'pitch_approved' else 'pitch_unapproved' end);

  return v_session;
end $fn$;

-- Default privileges already withhold execute from anon and authenticated
-- (20260921105702); only the service role, which the routes use, gets it.
grant execute on function public.approve_pitch(uuid, uuid, boolean, timestamptz) to service_role;
