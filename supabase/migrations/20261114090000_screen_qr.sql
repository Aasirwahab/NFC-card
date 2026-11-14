-- Screen-issued cards use the same first-scan binding and contact lifecycle.
-- NULL means physical; the timestamp is both provenance and the display deadline.
-- Code tombstones are permanent, even after removing the display timestamp on rollback.
-- Keep screen_card_codes and cards_guard_single_use: binding may precede the view write.
-- BEGIN ROLLBACK
-- begin;
-- lock table public.cards, public.sessions in access exclusive mode;
-- update public.cards c set status = 'voided'
--   where c.screen_issued_at is not null
--     and not exists (select 1 from public.sessions s where s.card_id = c.id and s.status = 'active');
-- drop function public.issue_screen_card(uuid, text);
-- drop function public.ops_card_stock();
-- drop trigger sessions_guard_screen_qr on public.sessions;
-- drop function public.sessions_guard_screen_qr();
-- drop trigger cards_record_screen_issuance on public.cards;
-- drop function public.cards_record_screen_issuance();
-- drop trigger cards_guard_screen_issuance on public.cards;
-- drop function public.cards_guard_screen_issuance();
-- alter table public.cards drop column screen_issued_at;
-- commit;
-- END ROLLBACK

alter table public.cards add column screen_issued_at timestamptz;
-- Retain retired codes without an owner after account deletion. Owners cannot erase history
-- to bypass the hourly cap or recreate an old code as physical stock.
create table public.screen_card_codes (
  code text primary key,
  user_id uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null
);
alter table public.screen_card_codes enable row level security;
revoke all on public.screen_card_codes from public, anon, authenticated;
create index screen_card_codes_user_issued on public.screen_card_codes(user_id, issued_at);

-- This guard deliberately survives rollback of the screen display feature.
create function public.cards_guard_single_use()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if tg_op = 'INSERT' or new.code is distinct from old.code then
    if exists (select 1 from public.screen_card_codes where code = new.code) then
      raise exception 'card_already_assigned' using errcode = '23505';
    end if;
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.screen_card_codes where code = old.code) then
    if new.user_id is distinct from old.user_id or new.code is distinct from old.code then
      raise exception 'card_in_use' using errcode = 'P0001';
    end if;
    if old.status <> 'available' and new.status = 'available' then
      raise exception 'card_not_releasable' using errcode = 'P0002';
    end if;
  end if;
  return new;
end $fn$;
create trigger cards_guard_single_use before insert or update on public.cards
  for each row execute function public.cards_guard_single_use();
revoke execute on function public.cards_guard_single_use() from public, anon, authenticated;
grant execute on function public.cards_guard_single_use() to service_role;

create function public.cards_record_screen_issuance()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if new.screen_issued_at is not null then
    insert into public.screen_card_codes(code, user_id, issued_at)
      values (new.code, new.user_id, new.screen_issued_at) on conflict (code) do nothing;
  end if;
  return new;
end $fn$;
create trigger cards_record_screen_issuance after insert or update of screen_issued_at on public.cards
  for each row execute function public.cards_record_screen_issuance();
revoke execute on function public.cards_record_screen_issuance() from public, anon, authenticated;
grant execute on function public.cards_record_screen_issuance() to service_role;

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

-- Both Redis and degraded paths use this transaction as the final issuance boundary.
create function public.issue_screen_card(p_user_id uuid, p_code text)
returns table(code text, screen_issued_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  perform pg_advisory_xact_lock(hashtextextended('screen_qr:' || p_user_id::text, 0));
  if (select count(*) from public.screen_card_codes c where c.user_id = p_user_id
      and c.issued_at >= clock_timestamp() - interval '1 hour') >= 30 then
    return;
  end if;
  return query insert into public.cards as c(user_id, code, screen_issued_at)
    values (p_user_id, p_code, clock_timestamp()) returning c.code, c.screen_issued_at;
end $fn$;
revoke execute on function public.issue_screen_card(uuid, text) from public, anon, authenticated;
grant execute on function public.issue_screen_card(uuid, text) to service_role;

create function public.ops_card_stock()
returns table(user_id uuid, in_stock bigint, handed_out bigint, lost bigint,
  needs_writing bigint, needs_verifying bigint, screen_issued bigint)
language sql stable security definer set search_path = public, pg_temp as $fn$
  select user_id,
    count(*) filter (where screen_issued_at is null and status = 'available'),
    count(*) filter (where screen_issued_at is null and status = 'assigned'),
    count(*) filter (where screen_issued_at is null and status = 'voided'),
    count(*) filter (where screen_issued_at is null and status = 'available' and written_at is null and verified_at is null),
    count(*) filter (where screen_issued_at is null and status = 'available' and written_at is not null and verified_at is null),
    count(*) filter (where screen_issued_at is not null)
  from public.cards group by user_id;
$fn$;
revoke execute on function public.ops_card_stock() from public, anon, authenticated;
grant execute on function public.ops_card_stock() to service_role;
