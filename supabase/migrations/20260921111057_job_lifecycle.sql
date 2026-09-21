-- TapLead — the job lifecycle (spec §13, Phase 3)
--
--   queued --claim--> running --complete--> succeeded
--     ^                  |
--     |                  +--yield (out of time, attempt given back)--> queued
--     |                  +--fail (attempts left, after a backoff)----> queued
--     |                  +--fail (attempts spent, or permanent)-------> dead
--     +---reap (lock older than N seconds, attempts left)-------------- running
--                          reap (attempts spent) -------------------->  dead
--
-- Every transition is one statement, so no lock is held across a model call or
-- an HTTP fetch — the pipeline's slow work happens between these calls, never
-- inside them.
--
-- THE LOCK GUARD. Every write a worker makes is conditional on
-- `locked_by = p_worker and status = 'running'`. If a worker stalls past the
-- reaper's threshold, its job is re-queued and claimed by someone else; when the
-- stalled worker wakes up, every write it attempts matches zero rows and returns
-- false. A zombie cannot overwrite a live worker's checkpoints or mark someone
-- else's job done.

-- ------------------------------------------------------------ claim_jobs
-- Replaces the §12.2 version with an optional type filter. A deployment only
-- claims job types it has a handler for, so a job type introduced in a later
-- phase — or by a newer deploy during a rolling release — waits in the queue
-- untouched instead of being claimed, failed and dead-lettered by a worker that
-- cannot run it. Two-argument calls keep working through the default.

drop function if exists public.claim_jobs(text, int);

create function public.claim_jobs(p_worker text, p_limit int, p_types text[] default null)
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
      where status = 'queued'
        and run_after <= now()
        and (p_types is null or type = any(p_types))
      order by run_after
      for update skip locked
      limit p_limit
   )
  returning j.*;
$fn$;

-- ---------------------------------------------------------- save_job_step
-- Checkpoints one step's output (§14.1). A retry resumes from here rather than
-- restarting, which is what turns a function timeout into a non-event.
create function public.save_job_step(
  p_job_id uuid, p_worker text, p_step text, p_output jsonb
) returns boolean
language sql
set search_path = public, pg_temp
as $fn$
  with updated as (
    update public.jobs
       set steps = steps || jsonb_build_object(p_step, p_output)
     where id = p_job_id and locked_by = p_worker and status = 'running'
    returning 1
  )
  select exists (select 1 from updated);
$fn$;

-- ----------------------------------------------------------- complete_job
create function public.complete_job(p_job_id uuid, p_worker text)
returns boolean
language sql
set search_path = public, pg_temp
as $fn$
  with updated as (
    update public.jobs
       set status = 'succeeded', locked_at = null, last_error = null
     where id = p_job_id and locked_by = p_worker and status = 'running'
    returning 1
  )
  select exists (select 1 from updated);
$fn$;

-- -------------------------------------------------------------- yield_job
-- The pipeline checked its remaining budget before a step and the step would not
-- fit (§13: "checkpoint and re-queue instead of starting it"). Running out of
-- time is not a failure, so the attempt the claim took is given back — otherwise
-- a long research pass would burn an attempt on every hop and die healthy.
create function public.yield_job(p_job_id uuid, p_worker text)
returns boolean
language sql
set search_path = public, pg_temp
as $fn$
  with updated as (
    update public.jobs
       set status    = 'queued',
           attempts  = greatest(attempts - 1, 0),
           run_after = now(),
           locked_at = null,
           locked_by = null
     where id = p_job_id and locked_by = p_worker and status = 'running'
    returning 1
  )
  select exists (select 1 from updated);
$fn$;

-- --------------------------------------------------------------- fail_job
-- Retry after a backoff while attempts remain; dead-letter when they are spent.
-- A null retry delay means the failure is permanent (the session was voided, the
-- input can never succeed) and goes straight to dead without wasting attempts.
--
-- Returns the job's new status, or null when this worker no longer holds it.
create function public.fail_job(
  p_job_id uuid, p_worker text, p_error text, p_retry_in_seconds int
) returns text
language sql
set search_path = public, pg_temp
as $fn$
  update public.jobs
     set status     = case
                        when p_retry_in_seconds is null or attempts >= max_attempts then 'dead'
                        else 'queued'
                      end,
         run_after  = now() + make_interval(secs => coalesce(p_retry_in_seconds, 0)),
         last_error = left(p_error, 2000),
         locked_at  = null,
         locked_by  = null
   where id = p_job_id and locked_by = p_worker and status = 'running'
  returning status;
$fn$;

-- -------------------------------------------------------------- reap_jobs
-- The safety net for a worker that died mid-job (§13): running with a lock older
-- than the threshold goes back to queued, or to dead when its attempts are spent.
-- The attempt the dead worker took is NOT given back — a job that reliably kills
-- its worker must eventually stop being retried.
--
-- Returns what it did to each job, so the caller can alert on the dead ones.
create function public.reap_jobs(p_stale_after_seconds int)
returns table (job_id uuid, job_type text, outcome text)
language sql
set search_path = public, pg_temp
as $fn$
  update public.jobs
     set status     = case when attempts >= max_attempts then 'dead' else 'queued' end,
         run_after  = now(),
         last_error = coalesce(last_error, '') ||
                      case when last_error is null then '' else ' | ' end ||
                      'reaped: worker lock expired after ' || p_stale_after_seconds || 's',
         locked_at  = null,
         locked_by  = null
   where status = 'running'
     and locked_at < now() - make_interval(secs => p_stale_after_seconds)
  returning id, type, status;
$fn$;

-- ------------------------------------------------------------ queue_stats
-- Everything the kick needs to size the fan-out, and the cron needs to alert on
-- a stuck queue (§24.2: more than three jobs queued for over fifteen minutes
-- means the kick and the sweep are both failing).
--
-- `stale_queued` counts only the types this deployment handles. A job with no
-- handler is waiting by design (its handler ships in a later phase), and
-- counting it would page someone every minute until then. Those are reported
-- separately as `unhandled`, for visibility without the alarm.
create function public.queue_stats(p_types text[] default null)
returns table (claimable int, running int, stale_queued int, unhandled int)
language sql
stable
set search_path = public, pg_temp
as $fn$
  select
    count(*) filter (where status = 'queued' and run_after <= now()
                       and (p_types is null or type = any(p_types)))::int,
    count(*) filter (where status = 'running')::int,
    count(*) filter (where status = 'queued'
                       and run_after < now() - interval '15 minutes'
                       and (p_types is null or type = any(p_types)))::int,
    count(*) filter (where status = 'queued'
                       and p_types is not null and not (type = any(p_types)))::int
  from public.jobs
  where status in ('queued', 'running');
$fn$;

-- ------------------------------------------ keeping the session in step
-- The job machine and the enrichment machine are separate on purpose (§10.2): a
-- job can be retried, reaped and re-run several times while the session stays in
-- `processing`, and the prospect-facing state only moves when the pipeline
-- commits. Two transitions DO cross over, and a trigger guarantees them whichever
-- code path causes them:
--
--   enrich job starts running  ->  session queued becomes processing
--   enrich job reaches dead    ->  session becomes failed
--
-- The second is the important one. Without it a dead job leaves the landing page
-- in the crafting state forever (§11.3 lists this as the reason `failed` exists);
-- with it, the prospect gets the template pitch and cannot tell anything went
-- wrong (§16).
create function public.jobs_sync_enrichment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.type <> 'enrich' or new.session_id is null then
    return new;
  end if;

  if new.status = 'running' then
    update public.sessions
       set enrichment_status     = 'processing',
           enrichment_started_at = coalesce(enrichment_started_at, now()),
           enrichment_attempts   = new.attempts
     where id = new.session_id
       and status = 'active'
       and enrichment_status in ('queued', 'processing');

  elsif new.status = 'dead' then
    update public.sessions
       set enrichment_status     = 'failed',
           enrichment_last_error = new.last_error
     where id = new.session_id
       and status = 'active'
       and enrichment_status in ('queued', 'processing');

    insert into public.session_events (session_id, type, meta)
    select new.session_id, 'enrichment_failed',
           jsonb_build_object('job_id', new.id, 'attempts', new.attempts)
     where exists (select 1 from public.sessions
                    where id = new.session_id and status = 'active');
  end if;

  return new;
end $fn$;

create trigger jobs_sync_enrichment
  after update of status on public.jobs
  for each row
  when (old.status is distinct from new.status)
  execute function public.jobs_sync_enrichment();

-- ---------------------------------------------------------------- grants
-- The default privileges set in 20260921105702 already withhold these from anon
-- and authenticated. The grants to the service role are explicit anyway, so this
-- migration does not depend on another file's side effects.

grant execute on function public.claim_jobs(text, int, text[])          to service_role;
grant execute on function public.save_job_step(uuid, text, text, jsonb) to service_role;
grant execute on function public.complete_job(uuid, text)              to service_role;
grant execute on function public.yield_job(uuid, text)                 to service_role;
grant execute on function public.fail_job(uuid, text, text, int)       to service_role;
grant execute on function public.reap_jobs(int)                        to service_role;
grant execute on function public.queue_stats(text[])                   to service_role;
