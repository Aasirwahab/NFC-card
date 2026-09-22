-- Booking (spec §19.1, Phase 5).

-- The rep's own Cal.com event, embedded on the prospect page. Https only; the app
-- parses it again before use (lib/booking/cal.ts).
alter table public.profiles
  add column booking_url text
    check (booking_url is null or (booking_url like 'https://%' and char_length(booking_url) <= 300));

-- --------------------------------------------------------------- record_booking

-- One Cal.com webhook delivery. Idempotent on (provider, provider_event_id), so a
-- replayed delivery updates rather than duplicates; a cancellation or reschedule
-- updates status rather than deleting the row (§19.1).
--
-- The session comes from booking metadata the prospect's browser supplied, so it
-- is only trusted as far as it names a real session: an unknown id is stored as
-- null (the booking is kept, unlinked) rather than failing the delivery.
--
-- A session event is written only when the status actually changes, so a replay
-- leaves the timeline alone. Returns 'created', 'updated' or 'unchanged'.
create function public.record_booking(
  p_uid             text,
  p_status          text,
  p_session_id      uuid,
  p_starts_at       timestamptz,
  p_email           text,
  p_name            text,
  p_rescheduled_from text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_session    uuid;
  v_old_status text;
  v_linked     uuid;
begin
  select id into v_session from public.sessions where id = p_session_id;

  select status, session_id into v_old_status, v_linked
    from public.bookings
   where provider = 'cal.com' and provider_event_id = p_uid
   for update;

  insert into public.bookings
    (session_id, provider, provider_event_id, prospect_email, prospect_name, starts_at, status)
  values
    (v_session, 'cal.com', p_uid, p_email, p_name, p_starts_at, p_status)
  on conflict (provider, provider_event_id) do update
     set status         = excluded.status,
         starts_at      = coalesce(excluded.starts_at, bookings.starts_at),
         prospect_email = coalesce(excluded.prospect_email, bookings.prospect_email),
         prospect_name  = coalesce(excluded.prospect_name, bookings.prospect_name),
         session_id     = coalesce(bookings.session_id, excluded.session_id);

  -- The booking this one replaces keeps its row, marked rescheduled.
  if p_rescheduled_from is not null then
    update public.bookings
       set status = 'rescheduled'
     where provider = 'cal.com'
       and provider_event_id = p_rescheduled_from
       and status <> 'rescheduled';
  end if;

  v_linked := coalesce(v_linked, v_session);

  if v_old_status is distinct from p_status and v_linked is not null then
    insert into public.session_events(session_id, type, meta)
    values (v_linked,
            case when p_status = 'cancelled' then 'booking_cancelled' else 'booking_created' end,
            jsonb_build_object('uid', p_uid, 'starts_at', p_starts_at));
  end if;

  return case
    when v_old_status is null then 'created'
    when v_old_status is distinct from p_status then 'updated'
    else 'unchanged'
  end;
end $fn$;

grant execute on function public.record_booking(text, text, uuid, timestamptz, text, text, text)
  to service_role;
