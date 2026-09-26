-- TapLead — release a pre-activated card that was never handed out (2026-09-25 review)
--
-- Venues often have no signal, so cards are registered to an event BEFORE it, on
-- wifi. At handover nothing needs the network; details are added afterwards by
-- card number. The cards left over need a way back, or every unused card has to
-- be voided and thrown away.
--
-- This deliberately bends §10.1 ("a card is bound to one session forever"), so it
-- is narrow. A card can be released only while there is NO sign it left the
-- rep's hand:
--   - no details were ever added (details_completed_at is null), and
--   - no prospect has ever opened it (first_viewed_at is null, view_count = 0).
-- The UI offers it only on the rep view, i.e. when the rep taps the physical card.
-- Residual risk, accepted for the pilot: a card handed over, never detailed and
-- not yet opened could be released by mistake and re-registered, and the first
-- holder would then see the second prospect's page. The UI copy says to release
-- only a card in your hand.
--
-- The session is voided (audit trail kept, same as void_session) and the card
-- goes back to 'available'. sessions_one_active_per_card only counts active
-- sessions, so the card can be registered again.

create function public.release_card(
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
   where id = p_session_id
     and user_id = p_user_id
     and status = 'active'
     and details_completed_at is null
     and first_viewed_at is null
     and view_count = 0
  returning * into v_session;

  if not found then
    raise exception 'card_not_releasable' using errcode = 'P0002';
  end if;

  update public.cards set status = 'available' where id = v_session.card_id;

  update public.jobs
     set status = 'dead', last_error = 'card_released'
   where session_id = p_session_id and status in ('queued','running');

  insert into public.session_events(session_id, type)
  values (p_session_id, 'released');

  return v_session;
end $fn$;

revoke execute on function public.release_card(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.release_card(uuid, uuid) to service_role;
