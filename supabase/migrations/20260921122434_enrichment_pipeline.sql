-- TapLead — the enrichment pipeline's database side (spec §12.3, §14, Phase 4)

-- ------------------------------------------------------- details_revision
-- Fixes the stale-edit race flagged in Phase 3.
--
-- A rep can edit a session while its enrich job is running (§10.2: "editable
-- afterwards", no locking). Two things went wrong:
--   1. jobs_one_live_per_session turned the edit's enqueue into a no-op, because
--      a job was already live — so the edit was never enriched; and
--   2. the running job then committed a pitch written from the OLD details.
--
-- Every save bumps the revision. The pipeline records the revision it started
-- from, and complete_enrichment refuses to commit a stale one. The job then
-- restarts itself from scratch against the new details — so one live job still
-- suffices, and the newest details always win.
alter table public.sessions add column details_revision int not null default 0;

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
         details_revision      = s.details_revision + 1,
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

  insert into public.jobs(type, session_id, user_id)
  values ('enrich', p_session_id, p_user_id)
  on conflict do nothing;

  return v_session;
end $fn$;

-- ---------------------------------------------------- enrichment_snapshot
-- Everything the pipeline reads, in ONE round trip and one consistent view. The
-- pipeline checkpoints this as its first step, so every later step and every
-- retry works from the same inputs even if the rep edits mid-run — and the
-- revision in it is what the commit checks.
--
-- It includes memorable_info. The note shapes the pitch's tone and is never
-- quoted (§5, §23.1); the quality gate enforces the "never quoted" half.
create function public.enrichment_snapshot(p_session_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'session', jsonb_build_object(
      'id',               s.id,
      'user_id',          s.user_id,
      'status',           s.status,
      'details_revision', s.details_revision,
      'prospect_name',    s.prospect_name,
      'prospect_company', s.prospect_company,
      'prospect_email',   s.prospect_email,
      'niche',            s.niche,
      'problems',         to_jsonb(s.problems),
      'custom_problems',  s.custom_problems,
      'memorable_info',   s.memorable_info
    ),
    'rep', (select jsonb_build_object('full_name', p.full_name, 'title', p.title)
              from public.profiles p where p.id = s.user_id),
    'business', (select jsonb_build_object(
                          'company_name', b.company_name,
                          'tagline',      b.tagline,
                          'website',      b.website,
                          'services',     to_jsonb(b.services),
                          'pricing',      b.pricing)
                   from public.business_profiles b where b.user_id = s.user_id),
    'knowledge', (select coalesce(jsonb_agg(jsonb_build_object('topic', k.topic, 'content', k.content)
                                            order by k.topic, k.created_at), '[]'::jsonb)
                    from public.knowledge_base k where k.user_id = s.user_id),
    'event', (select jsonb_build_object('name', e.name) from public.events e where e.id = s.event_id)
  )
  from public.sessions s
  where s.id = p_session_id;
$fn$;

-- ----------------------------------------------------- complete_enrichment
-- Replaces the §12.3 version: same idempotent commit, plus the revision check.
-- Returns what happened rather than a boolean, because the caller must act
-- differently on each:
--
--   committed  the pitch is live
--   replay     this exact revision was already committed — a no-op
--   stale      the rep edited since this run started — restart against the new details
--   inactive   the session was voided — stop
--   missing    no such session — stop
--
-- p_revision is optional so callers that predate it (the seed) keep working.
drop function if exists public.complete_enrichment(uuid, jsonb, text, text);

create function public.complete_enrichment(
  p_session_id uuid,
  p_research   jsonb,
  p_pitch      text,
  p_model      text,
  p_revision   int default null
) returns text
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_session public.sessions;
begin
  select * into v_session from public.sessions where id = p_session_id for update;

  if not found then return 'missing'; end if;
  if v_session.status <> 'active' then return 'inactive'; end if;
  if p_revision is not null and v_session.details_revision <> p_revision then return 'stale'; end if;
  if v_session.enrichment_status = 'completed' then return 'replay'; end if;

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

  return 'committed';
end $fn$;

-- ------------------------------------------------------ reject_enrichment
-- The quality gate rejected the pitch twice (§14.2). The session goes to
-- `failed`, which renders the deterministic template pitch built from the stated
-- problem (§16) — the prospect cannot tell anything went wrong. The research is
-- kept; any older generated pitch is cleared, because it was written from older
-- details and the template reflects the current ones.
--
-- The rejection is recorded as a session event: the gate's rejection RATE is an
-- alert in its own right (§24.2), since it is how a prompt regression shows up
-- before prospects see it.
create function public.reject_enrichment(
  p_session_id uuid,
  p_research   jsonb,
  p_reason     text,
  p_revision   int default null
) returns text
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_session public.sessions;
begin
  select * into v_session from public.sessions where id = p_session_id for update;

  if not found then return 'missing'; end if;
  if v_session.status <> 'active' then return 'inactive'; end if;
  if p_revision is not null and v_session.details_revision <> p_revision then return 'stale'; end if;

  update public.sessions
     set enrichment_status     = 'failed',
         research              = p_research,
         generated_pitch       = null,
         generated_pitch_model = null,
         enrichment_last_error = left('quality_gate: ' || p_reason, 2000)
   where id = p_session_id;

  insert into public.session_events(session_id, type, meta)
  values (p_session_id, 'quality_gate_rejected', jsonb_build_object('reason', left(p_reason, 500)));

  return 'rejected';
end $fn$;

-- ------------------------------------------------------------- restart_job
-- Wipes a job's checkpoints and re-queues it, without counting an attempt: the
-- run did nothing wrong, the inputs changed under it. Used when the commit
-- reports `stale`. Guarded by the lock like every other worker write.
create function public.restart_job(p_job_id uuid, p_worker text)
returns boolean
language sql
set search_path = public, pg_temp
as $fn$
  with updated as (
    update public.jobs
       set status    = 'queued',
           steps     = '{}'::jsonb,
           attempts  = greatest(attempts - 1, 0),
           run_after = now(),
           locked_at = null,
           locked_by = null
     where id = p_job_id and locked_by = p_worker and status = 'running'
    returning 1
  )
  select exists (select 1 from updated);
$fn$;

-- ----------------------------------------------------- requeue_enrichment
-- POST /api/sessions/[id]/re-enrich (§15.2): a manual retry after a failure, or
-- a regenerate after editing the business profile. Bumping the revision makes
-- any in-flight run commit `stale` and restart, so a request made mid-run is
-- never silently swallowed.
create function public.requeue_enrichment(p_session_id uuid, p_user_id uuid)
returns public.sessions
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_session public.sessions;
begin
  select * into v_session from public.sessions
   where id = p_session_id and user_id = p_user_id and status = 'active'
     for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if v_session.details_completed_at is null then
    -- A pending session has nothing to research yet (§16: the warm generic page).
    raise exception 'details_missing' using errcode = 'P0001';
  end if;

  update public.sessions
     set details_revision      = details_revision + 1,
         enrichment_status     = 'queued',
         enrichment_last_error = null
   where id = p_session_id
  returning * into v_session;

  insert into public.session_events(session_id, type)
  values (p_session_id, 're_enrich_requested');

  insert into public.jobs(type, session_id, user_id)
  values ('enrich', p_session_id, p_user_id)
  on conflict do nothing;

  return v_session;
end $fn$;

-- ---------------------------------------------------------------- grants
grant execute on function public.save_session_details(uuid, uuid, jsonb)              to service_role;
grant execute on function public.enrichment_snapshot(uuid)                           to service_role;
grant execute on function public.complete_enrichment(uuid, jsonb, text, text, int)   to service_role;
grant execute on function public.reject_enrichment(uuid, jsonb, text, int)           to service_role;
grant execute on function public.restart_job(uuid, text)                             to service_role;
grant execute on function public.requeue_enrichment(uuid, uuid)                      to service_role;

-- --------------------------------------------------------------- yield_job
-- Gains an optional delay. A yield because the invocation ran out of time
-- should be picked up at once (delay 0, as before). A yield because the model
-- concurrency limit is full should NOT be — re-queued at once, it would be
-- re-claimed at once and spin. Two-argument calls keep working.
drop function if exists public.yield_job(uuid, text);

create function public.yield_job(p_job_id uuid, p_worker text, p_delay_seconds int default 0)
returns boolean
language sql
set search_path = public, pg_temp
as $fn$
  with updated as (
    update public.jobs
       set status    = 'queued',
           attempts  = greatest(attempts - 1, 0),
           run_after = now() + make_interval(secs => greatest(p_delay_seconds, 0)),
           locked_at = null,
           locked_by = null
     where id = p_job_id and locked_by = p_worker and status = 'running'
    returning 1
  )
  select exists (select 1 from updated);
$fn$;

grant execute on function public.yield_job(uuid, text, int) to service_role;
