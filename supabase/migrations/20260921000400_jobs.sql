-- TapLead — the job queue (spec §11.4, §13)
--
-- Postgres is the queue. No broker, no second datastore, no new service — and jobs
-- are enqueued in the SAME TRANSACTION as the data that caused them, so a job can
-- never exist for a session that was rolled back.

create table public.jobs (
  id           uuid primary key default gen_random_uuid(),
  type         text not null,                -- 'enrich' | 'followup' | 'purge'
  session_id   uuid references public.sessions(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  payload      jsonb not null default '{}',
  -- Checkpointed step outputs. A retry resumes rather than restarts (§14.1).
  steps        jsonb not null default '{}',
  status       text not null default 'queued'
               check (status in ('queued','running','succeeded','failed','dead')),
  attempts     int  not null default 0,
  max_attempts int  not null default 3,
  run_after    timestamptz not null default now(),
  locked_at    timestamptz,
  locked_by    text,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index jobs_claimable on public.jobs(run_after) where status = 'queued';

-- Never two live enrichments for one session. Both the after() kick and the cron
-- sweep can reach the same row; this makes a double-enqueue impossible (§13).
create unique index jobs_one_live_per_session on public.jobs(session_id, type)
  where status in ('queued','running');

-- Drives the reaper: running jobs whose lock has gone stale (§13).
create index jobs_locked on public.jobs(locked_at) where status = 'running';

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

alter table public.jobs enable row level security;

create policy jobs_owner on public.jobs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.jobs from anon;
