-- INSIGNAR — operating model v2: a lead can be filed under a different event.
--
-- A card tapped when no event was on lands under "Unsorted". The rep files it
-- under the right event afterwards. Sequence number and colour are session
-- properties (§10.1) taken from the target event's counter, so numbering stays
-- unique within each event.

create or replace function public.move_session_to_event(
  p_session_id uuid,
  p_event_id   uuid,
  p_user_id    uuid
) returns public.sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_session public.sessions;
  v_seq     int;
begin
  select * into v_session
    from public.sessions
   where id = p_session_id and user_id = p_user_id and status = 'active'
   for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if v_session.event_id = p_event_id then
    return v_session;
  end if;

  update public.events
     set next_card_sequence = next_card_sequence + 1
   where id = p_event_id and user_id = p_user_id
  returning next_card_sequence - 1 into v_seq;
  if v_seq is null then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;

  update public.sessions
     set event_id = p_event_id,
         event_sequence_number = v_seq,
         colour_tag = public.colour_for_sequence(v_seq)
   where id = p_session_id
  returning * into v_session;

  return v_session;
end $fn$;

revoke execute on function public.move_session_to_event(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function public.move_session_to_event(uuid, uuid, uuid) to service_role;
