-- INSIGNAR — operator console (staff only).
--
-- Staff issue cards to reps, write each NFC sticker, print the matching QR and
-- watch stock. Nothing here is reachable by a rep or a prospect: every new table
-- is service-role only, and the application checks the staff allow-list before
-- it touches any of them.
--
--   * cards.written_at / verified_at: where a physical card is in programming.
--     Independent of `status` (available/assigned/voided) so the rep flows are
--     untouched. A staff tap on a still-available card sets both.
--   * staff_audit_log: every operator write, who did it and to whom.
--   * profiles.low_stock_at: per-rep reorder level.
--   * card_orders: a rep asking for more cards; staff fulfil it by issuing a batch.
--   * ops_reassign_card: move a card nobody has used to another rep.

alter table public.cards
  add column written_at  timestamptz,
  add column verified_at timestamptz;

alter table public.profiles
  add column low_stock_at integer not null default 5 check (low_stock_at between 0 and 500);

-- A rep's own session can reach `cards` through the API (owner policy), so the
-- programming columns must not be writable from it: only the server (service
-- role) sets them. A column-level revoke would do nothing while the table-wide
-- UPDATE grant exists, so a trigger enforces it.
create function public.cards_guard_programming()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if current_user in ('anon', 'authenticated')
     and (new.written_at is distinct from old.written_at
          or new.verified_at is distinct from old.verified_at) then
    raise exception 'programming_columns_are_server_only' using errcode = '42501';
  end if;
  return new;
end $fn$;

create trigger cards_guard_programming
  before update on public.cards
  for each row execute function public.cards_guard_programming();

create table public.staff_audit_log (
  id             bigserial primary key,
  actor_email    text not null check (char_length(actor_email) between 3 and 254),
  action         text not null check (char_length(action) between 1 and 64),
  target_user_id uuid,
  target_code    text,
  meta           jsonb not null default '{}'::jsonb,
  at             timestamptz not null default now()
);
create index staff_audit_target on public.staff_audit_log(target_user_id, at desc);

create table public.card_orders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  quantity   integer not null check (quantity between 1 and 500),
  status     text not null default 'requested'
               check (status in ('requested', 'ordered', 'shipped', 'cancelled')),
  note       text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index card_orders_user on public.card_orders(user_id, created_at desc);
create index card_orders_open on public.card_orders(status) where status in ('requested', 'ordered');

create trigger card_orders_set_updated_at
  before update on public.card_orders
  for each row execute function public.set_updated_at();

alter table public.staff_audit_log enable row level security;
alter table public.card_orders enable row level security;
revoke all on public.staff_audit_log from anon, authenticated;
revoke all on public.card_orders from anon, authenticated;
revoke all on sequence public.staff_audit_log_id_seq from anon, authenticated;

-- ---------------------------------------------------------- ops_reassign_card

-- Only a card that has never been used: available, with no session ever.
create or replace function public.ops_reassign_card(p_code text, p_new_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_card public.cards;
begin
  select * into v_card from public.cards where code = p_code for update;
  if not found then
    raise exception 'card_not_found' using errcode = 'P0002';
  end if;
  if v_card.status <> 'available'
     or exists (select 1 from public.sessions where card_id = v_card.id) then
    raise exception 'card_in_use' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users where id = p_new_user_id) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  update public.cards set user_id = p_new_user_id, batch_id = null where id = v_card.id;
end $fn$;

revoke execute on function public.ops_reassign_card(text, uuid) from public, anon, authenticated;
grant  execute on function public.ops_reassign_card(text, uuid) to service_role;
