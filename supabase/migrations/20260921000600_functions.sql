-- TapLead — database functions (spec §12)
--
-- Two operations are concurrency-sensitive and both live in the database, where a
-- row lock is available. This codebase will be written partly by AI assistants over
-- months; the schema is the thing that cannot be talked out of a rule (§9.5).
--
-- Every function below pins its search_path, and execute is granted to service_role
-- only. The browser never talks to Postgres (§9.2), so there is no legitimate caller
-- other than a route handler.

-- ---------------------------------------------------- colour_for_sequence

-- A fixed palette of eight (§10.3). Card 9 repeats Card 1's colour; shown with the
-- number it is still unambiguous. Colours are digital only — cards stay identical
-- and cheap, with no batch-print customisation.
--
-- lib/domain/colours.ts mirrors this list and an integration test asserts they agree.
create or replace function public.colour_for_sequence(p_sequence int)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select (array['Red','Blue','Green','Yellow','Purple','Orange','Pink','Teal'])
         [((greatest(p_sequence, 1) - 1) % 8) + 1];
$fn$;

-- --------------------------------------------------------- register_card

-- Runs on the rep's tap, before handover. Must survive a double tap, an offline
-- retry arriving twice, and two reps racing for the same card (§12.1).
create or replace function public.register_card(
  p_session_id    uuid,      -- generated on the device (§15.4)
  p_code          text,
  p_event_id      uuid,
  p_user_id       uuid,
  p_registered_by text,
  p_first_name    text default null
) returns public.sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_card    public.cards;
  v_seq     int;
  v_session public.sessions;
begin
  -- 1. Idempotency: this exact client-generated id already landed. Returning the
  --    existing row is what makes an offline outbox flush safe to repeat (§17.1).
  select * into v_session
    from public.sessions
   where id = p_session_id and user_id = p_user_id;
  if found then
    return v_session;
  end if;

  -- 2. Claim the card under a row lock.
  select * into v_card
    from public.cards
   where code = p_code and user_id = p_user_id
   for update;
  if not found then
    raise exception 'card_not_found' using errcode = 'P0002';
  end if;
  if v_card.status <> 'available' then
    raise exception 'card_already_assigned' using errcode = 'P0001';
  end if;

  -- 3. Take the next per-event sequence number under a row lock. RETURNING gives
  --    the new value, so subtracting one yields the number this card gets.
  update public.events
     set next_card_sequence = next_card_sequence + 1
   where id = p_event_id and user_id = p_user_id
  returning next_card_sequence - 1 into v_seq;
  if v_seq is null then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;

  update public.cards set status = 'assigned' where id = v_card.id;

  insert into public.sessions (id, user_id, card_id, event_id,
                               event_sequence_number, colour_tag,
                               prospect_name, registered_by)
  values (p_session_id, p_user_id, v_card.id, p_event_id,
          v_seq, public.colour_for_sequence(v_seq),
          p_first_name, p_registered_by)
  returning * into v_session;

  insert into public.session_events(session_id, type)
  values (v_session.id, 'registered');

  return v_session;
end $fn$;

-- --------------------------------------------------- save_session_details

-- Phase two of capture (§10.2), minutes later and away from the prospect. The
-- details write and the enqueue happen in ONE transaction, so a job can never exist
-- for a session that was rolled back, and a saved session can never fail to
-- enqueue (§13).
--
-- Re-saving an already-enriched session re-queues it: the lifecycle explicitly
-- allows edit -> regenerate (§10.2).
create or replace function public.save_session_details(
  p_session_id uuid,
  p_user_id    uuid,
  p_details    jsonb
) returns public.sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_session public.sessions;
begin
  update public.sessions s
     set prospect_name    = nullif(p_details->>'prospect_name', ''),
         prospect_company = nullif(p_details->>'prospect_company', ''),
         prospect_email   = nullif(p_details->>'prospect_email', ''),
         prospect_phone   = nullif(p_details->>'prospect_phone', ''),
         linkedin_url     = nullif(p_details->>'linkedin_url', ''),
         niche            = nullif(p_details->>'niche', ''),
         problems         = coalesce(
                              array(select jsonb_array_elements_text(p_details->'problems')),
                              '{}'),
         custom_problems  = nullif(p_details->>'custom_problems', ''),
         memorable_info   = nullif(p_details->>'memorable_info', ''),
         details_completed_at  = now(),
         enrichment_status     = 'queued',
         enrichment_last_error = null
   where s.id = p_session_id
     and s.user_id = p_user_id
     and s.status = 'active'
  returning * into v_session;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  insert into public.session_events(session_id, type)
  values (p_session_id, 'details_saved');

  -- jobs_one_live_per_session makes a double-enqueue impossible; ON CONFLICT turns
  -- the race into a no-op rather than an error (§13).
  insert into public.jobs(type, session_id, user_id)
  values ('enrich', p_session_id, p_user_id)
  on conflict do nothing;

  return v_session;
end $fn$;

-- ---------------------------------------------------------- void_session

-- A rep registered the wrong card. The session is voided rather than deleted — the
-- audit trail stays — and the card is voided too, because it may already be in
-- someone's pocket (§10.1).
create or replace function public.void_session(
  p_session_id uuid,
  p_user_id    uuid
) returns public.sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_session public.sessions;
begin
  update public.sessions
     set status = 'voided'
   where id = p_session_id and user_id = p_user_id and status = 'active'
  returning * into v_session;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  update public.cards set status = 'voided' where id = v_session.card_id;

  -- Any pending enrichment for a voided session is pointless work.
  update public.jobs
     set status = 'dead', last_error = 'session_voided'
   where session_id = p_session_id and status in ('queued','running');

  insert into public.session_events(session_id, type)
  values (p_session_id, 'voided');

  return v_session;
end $fn$;

-- --------------------------------------------------- record_prospect_view

-- Only a prospect-view render sets first_viewed_at (§10.4). The caller decides
-- whether a render counts — a rep self-tap, a known bot, or a repeat from the same
-- IP inside 60 seconds never reaches here. This function owns the atomicity, not
-- the policy.
--
-- Returns true when this was the first view, so the caller can log it once.
create or replace function public.record_prospect_view(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_was_first boolean;
begin
  update public.sessions
     set view_count      = view_count + 1,
         first_viewed_at = coalesce(first_viewed_at, now())
   where id = p_session_id
  returning (view_count = 1) into v_was_first;

  if not found then
    return false;
  end if;

  if v_was_first then
    insert into public.session_events(session_id, type)
    values (p_session_id, 'prospect_viewed');
  end if;

  return v_was_first;
end $fn$;

-- ------------------------------------------------------------- claim_jobs

-- FOR UPDATE SKIP LOCKED is what makes several concurrent workers safe (§12.2).
create or replace function public.claim_jobs(p_worker text, p_limit int)
returns setof public.jobs
language sql
set search_path = public, pg_temp
as $fn$
  update public.jobs j
     set status     = 'running',
         locked_at  = now(),
         locked_by  = p_worker,
         attempts   = j.attempts + 1,
         updated_at = now()
   where j.id in (
     select id from public.jobs
      where status = 'queued' and run_after <= now()
      order by run_after
      for update skip locked
      limit p_limit
   )
  returning j.*;
$fn$;

-- ----------------------------------------------------- complete_enrichment

-- Idempotent commit (§12.3). Enrichment completion can be delivered more than once;
-- a replay is a no-op rather than a second write.
create or replace function public.complete_enrichment(
  p_session_id uuid,
  p_research   jsonb,
  p_pitch      text,
  p_model      text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_status text;
begin
  select enrichment_status into v_status
    from public.sessions where id = p_session_id for update;

  if not found then return false; end if;
  if v_status = 'completed' then return true; end if;   -- replay, no-op

  update public.sessions
     set enrichment_status       = 'completed',
         research                = p_research,
         generated_pitch         = p_pitch,
         generated_pitch_model   = p_model,
         enrichment_completed_at = now(),
         enrichment_last_error   = null
   where id = p_session_id;

  insert into public.session_events(session_id, type, meta)
  values (p_session_id, 'enrichment_completed', jsonb_build_object('model', p_model));

  return true;
end $fn$;

-- ---------------------------------------------------------------- grants
-- Every read and write goes through a route handler using the service role (§9.2).
-- No browser, signed in or not, may execute any of these.

do $grants$
declare fn text;
begin
  foreach fn in array array[
    'public.register_card(uuid,text,uuid,uuid,text,text)',
    'public.save_session_details(uuid,uuid,jsonb)',
    'public.void_session(uuid,uuid)',
    'public.record_prospect_view(uuid)',
    'public.claim_jobs(text,int)',
    'public.complete_enrichment(uuid,jsonb,text,text)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    begin
      execute format('grant execute on function %s to service_role', fn);
    exception when undefined_object then
      -- service_role does not exist outside Supabase (e.g. the test harness).
      null;
    end;
  end loop;
end $grants$;
