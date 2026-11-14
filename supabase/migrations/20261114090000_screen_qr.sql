-- Screen-issued cards use the same first-scan binding and contact lifecycle.
-- NULL means physical; the timestamp is both provenance and the display deadline.
-- Rollback (screen codes must remain unbindable; do not turn them into physical stock):
-- update public.cards set status = 'voided'
--   where screen_issued_at is not null and status = 'available';
-- drop trigger sessions_guard_screen_qr on public.sessions;
-- drop function public.sessions_guard_screen_qr();
-- drop trigger cards_guard_screen_issuance on public.cards;
-- drop function public.cards_guard_screen_issuance();
-- alter table public.cards drop column screen_issued_at;

alter table public.cards add column screen_issued_at timestamptz;

-- The owner policy on cards cannot be used to remove or refresh this marker.
create function public.cards_guard_screen_issuance()
returns trigger language plpgsql set search_path = public, pg_temp as $fn$
begin
  if current_user in ('anon', 'authenticated') then
    if (tg_op = 'INSERT' and new.screen_issued_at is not null)
       or (tg_op = 'UPDATE' and new.screen_issued_at is distinct from old.screen_issued_at) then
      raise exception 'screen_issuance_is_server_only' using errcode = '42501';
    end if;
  end if;
  -- A screen contact begins with the prospect's scan, never preactivation.
  -- Do not let release_card reuse it in the gap before the view counter write.
  if tg_op = 'UPDATE' and old.screen_issued_at is not null
     and old.status <> 'available' and new.status = 'available' then
    raise exception 'card_not_releasable' using errcode = 'P0002';
  end if;
  return new;
end $fn$;

create trigger cards_guard_screen_issuance before insert or update on public.cards
  for each row execute function public.cards_guard_screen_issuance();

-- At the binding boundary, so both registration RPCs and direct inserts obey
-- the deadline. register_card already locks the card; failure rolls back its
-- claim, event choice and sequence number. Existing contacts are never expired.
create function public.sessions_guard_screen_qr()
returns trigger language plpgsql set search_path = public, pg_temp as $fn$
declare
  v_issued_at timestamptz;
begin
  select screen_issued_at into v_issued_at from public.cards where id = new.card_id for update;
  if v_issued_at is not null then
    if v_issued_at + interval '30 minutes' <= clock_timestamp() then
      raise exception 'screen_qr_expired' using errcode = 'P0001';
    end if;
    if current_user in ('anon', 'authenticated')
       or new.registered_by is distinct from 'prospect_tap' then
      raise exception 'screen_qr_not_scanned' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $fn$;

create trigger sessions_guard_screen_qr before insert on public.sessions
  for each row execute function public.sessions_guard_screen_qr();

revoke execute on function public.cards_guard_screen_issuance() from public, anon, authenticated;
revoke execute on function public.sessions_guard_screen_qr() from public, anon, authenticated;
grant execute on function public.cards_guard_screen_issuance() to service_role;
grant execute on function public.sessions_guard_screen_qr() to service_role;
