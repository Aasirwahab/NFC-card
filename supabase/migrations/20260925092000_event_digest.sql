-- TapLead — the morning-after event email (2026-09-25 review)
--
-- Reps not adding details is the biggest risk to pitch quality, and the
-- dashboard only helps a rep who opens it. So the morning after an event the
-- rep gets one email: how the event went (handed out, opened, booked) and which
-- cards still need details, by card number and colour. A second nudge goes out
-- at 48 hours only if something is still missing (the handler skips otherwise).
--
-- Scheduling rides on the existing minute cron: queue_event_digests() finds
-- digests that have come due and enqueues an ordinary job for each. The
-- event_digests primary key makes it idempotent, so running it every minute,
-- or twice at once, sends each digest exactly once.

create table public.event_digests (
  event_id  uuid not null references public.events(id) on delete cascade,
  round     int  not null check (round in (1, 2)),
  queued_at timestamptz not null default now(),
  primary key (event_id, round)
);

alter table public.event_digests enable row level security;
-- Service role only: nothing in the app reads this table directly.
revoke all on public.event_digests from anon, authenticated;

create function public.queue_event_digests(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_count int;
begin
  with event_days as (
    -- The event's day: its date if the rep set one, else the London day of its
    -- first registration.
    select e.id as event_id,
           e.user_id,
           coalesce(e.event_date,
                    (min(s.registered_at) at time zone 'Europe/London')::date) as day
      from public.events e
      join public.sessions s on s.event_id = e.id and s.status = 'active'
     group by e.id
  ),
  due as (
    select d.event_id, d.user_id, r.round
      from event_days d
      cross join (values (1), (2)) as r(round)
     -- 08:00 London on day + round.
     where ((d.day + r.round) + time '08:00') at time zone 'Europe/London' <= p_now
       -- Never mail about old events, e.g. on the first deploy of this feature.
       and ((d.day + r.round) + time '08:00') at time zone 'Europe/London' > p_now - interval '2 days'
  ),
  claimed as (
    insert into public.event_digests(event_id, round)
    select event_id, round from due
    on conflict do nothing
    returning event_id, round
  )
  insert into public.jobs(type, user_id, payload)
  select 'event_digest', d.user_id, jsonb_build_object('event_id', c.event_id, 'round', c.round)
    from claimed c
    join due d using (event_id, round);

  get diagnostics v_count = row_count;
  return v_count;
end $fn$;

revoke execute on function public.queue_event_digests(timestamptz) from public, anon, authenticated;
grant  execute on function public.queue_event_digests(timestamptz) to service_role;
