-- INSIGNAR — operating model v2 (Zaid, 2026-09-29)
--
--   * Cards are issued to a rep by the operators, so a rep no longer registers a
--     card before handing it over. The FIRST TAP on an unused card, by the rep or
--     by the prospect, creates the session. Details are added later by card code.
--   * An event is a label and an optional target. The session goes to the event
--     that is on now; with none, to a per-rep "Unsorted" event, so sessions.event_id
--     stays NOT NULL and results and numbering keep working unchanged.
--   * A rep can mark an unused card lost.
--
-- register_card (spec §12.1) is unchanged and does the claiming; these wrap it.

alter table public.events
  add column target_cards integer
  check (target_cards is null or target_cards between 1 and 10000);

-- ------------------------------------------------------------- pick_event

-- The event a first tap belongs to: the event dated nearest to today (UK time),
-- from two days ago to tomorrow. Tomorrow is included so cards tapped the evening
-- before, or on a set-up day, still land under the event they are for. With none,
-- "Unsorted": one per rep, created on demand, carrying the niches of the rep's
-- newest event so the problem chips still work.
create unique index events_one_unsorted_per_rep
  on public.events (user_id) where name = 'Unsorted';

create or replace function public.pick_event(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_id    uuid;
begin
  select id into v_id
    from public.events
   where user_id = p_user_id
     and name <> 'Unsorted'
     and event_date between v_today - 2 and v_today + 1
   order by abs(event_date - v_today), event_date desc, created_at desc
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- Concurrent first taps race to create the one Unsorted event; the unique index
  -- lets exactly one insert win and the rest read it back.
  insert into public.events (user_id, name, niches)
  values (
    p_user_id,
    'Unsorted',
    coalesce(
      (select niches from public.events
        where user_id = p_user_id order by created_at desc limit 1),
      '[]'::jsonb)
  )
  on conflict (user_id) where name = 'Unsorted' do nothing
  returning id into v_id;
  if v_id is not null then
    return v_id;
  end if;

  select id into v_id
    from public.events
   where user_id = p_user_id and name = 'Unsorted';
  return v_id;
end $fn$;

-- -------------------------------------------------------- tap_register_card

-- First tap on an unused card. Idempotent on the session id, like register_card,
-- and raises the same card_not_found / card_already_assigned errors.
create or replace function public.tap_register_card(
  p_session_id    uuid,
  p_code          text,
  p_user_id       uuid,
  p_registered_by text
) returns public.sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_event uuid;
begin
  -- An idempotent replay must not create an "Unsorted" event as a side effect.
  if exists (select 1 from public.sessions
              where id = p_session_id and user_id = p_user_id) then
    return public.register_card(p_session_id, p_code, null, p_user_id, p_registered_by, null);
  end if;

  v_event := public.pick_event(p_user_id);
  return public.register_card(p_session_id, p_code, v_event, p_user_id, p_registered_by, null);
end $fn$;

-- ---------------------------------------------------------- mark_card_lost

-- An unused card the rep has lost. It is voided, so a finder sees the portfolio
-- and nothing else; it can never be registered. A card that already has a session
-- goes through void_session instead.
create or replace function public.mark_card_lost(p_code text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_status text;
begin
  select status into v_status
    from public.cards
   where code = p_code and user_id = p_user_id
   for update;
  if not found then
    raise exception 'card_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'available' then
    raise exception 'card_in_use' using errcode = 'P0001';
  end if;
  update public.cards set status = 'voided' where code = p_code and user_id = p_user_id;
end $fn$;

revoke execute on function public.pick_event(uuid) from public, anon, authenticated;
revoke execute on function public.tap_register_card(uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.mark_card_lost(text, uuid) from public, anon, authenticated;
grant  execute on function public.pick_event(uuid) to service_role;
grant  execute on function public.tap_register_card(uuid, text, uuid, text) to service_role;
grant  execute on function public.mark_card_lost(text, uuid) to service_role;
