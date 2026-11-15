-- INSIGNAR — the Monday rep digest (2026-11-14)
--
-- The morning-after event email covers one event. Between events a rep has no
-- reason to open the app, and the pilot is won or lost on whether they come
-- back. So every Monday at 08:00 in the rep's own time zone they get one email:
-- who opened their page and has not booked, follow-up drafts ready to send,
-- and questions the assistant passed to them. The handler sends nothing when
-- there is nothing to act on.
--
-- Scheduling rides on the minute cron, like queue_event_digests(): the
-- weekly_digests primary key makes it idempotent. Only reps with a card
-- registered in the last 8 weeks are included, and any rep can turn it off in
-- Setup (profiles.weekly_digest).
--
-- Rollback:
--   drop function if exists public.queue_weekly_digests(timestamptz);
--   drop table if exists public.weekly_digests;
--   alter table public.profiles drop column if exists weekly_digest;
--   delete from public.jobs where type = 'weekly_digest';

alter table public.profiles
  add column weekly_digest boolean not null default true;

create table public.weekly_digests (
  user_id    uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  queued_at  timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.weekly_digests enable row level security;
-- Service role only: nothing in the app reads this table directly.
revoke all on public.weekly_digests from anon, authenticated;

create function public.queue_weekly_digests(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_count int;
begin
  with reps as (
    -- An unknown or empty zone falls back to London rather than failing the sweep.
    select p.id as user_id,
           case when exists (select 1 from pg_timezone_names z where z.name = p.timezone)
                then p.timezone else 'Europe/London' end as tz
      from public.profiles p
     where p.weekly_digest
       and exists (
         select 1 from public.sessions s
          where s.user_id = p.id
            and s.registered_at > p_now - interval '56 days'
       )
  ),
  weeks as (
    -- Monday of the rep's current local week.
    select user_id, tz, date_trunc('week', p_now at time zone tz)::date as week_start
      from reps
  ),
  due as (
    select user_id, week_start
      from weeks
     where (week_start + time '08:00') at time zone tz <= p_now
       -- Never catch up on a missed Monday, e.g. on the first deploy of this feature.
       and (week_start + time '08:00') at time zone tz > p_now - interval '1 day'
  ),
  claimed as (
    insert into public.weekly_digests(user_id, week_start)
    select user_id, week_start from due
    on conflict do nothing
    returning user_id, week_start
  )
  insert into public.jobs(type, user_id, payload)
  select 'weekly_digest', c.user_id, jsonb_build_object('week_start', c.week_start)
    from claimed c;

  get diagnostics v_count = row_count;
  return v_count;
end $fn$;

revoke execute on function public.queue_weekly_digests(timestamptz) from public, anon, authenticated;
grant  execute on function public.queue_weekly_digests(timestamptz) to service_role;
