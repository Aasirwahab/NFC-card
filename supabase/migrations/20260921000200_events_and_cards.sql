-- TapLead — events and cards (spec §11.2)
--
-- A card is consumable. Once handed to a person it is theirs forever and the rep
-- will never hold it again (§10.1). The status machine below is therefore:
--
--   available --register--> assigned  (terminal)
--       |
--       +-------void------> voided    (terminal: damaged, lost, never handed over)
--
-- cards is one of the two irreplaceable tables (§24.4): the codes are physically
-- written to NTAG215 chips already in strangers' wallets, and tags cannot be
-- re-pointed. Losing this table bricks every card in the field, permanently.

create table public.events (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  name               text not null,
  event_date         date,
  location           text,
  -- [{ name, problems: [] }] — the niche-specific quick-select problem sets, which
  -- are proprietary domain knowledge, not a UI convenience (§3).
  niches             jsonb not null default '[]',
  -- Per-event counter. Sequence numbers reset per event; cards are generic stock
  -- and are not tied to an event until handed out (§10.3).
  next_card_sequence int not null default 1,
  created_at         timestamptz not null default now()
);

create index events_user on public.events(user_id, created_at desc);

create table public.card_batches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  label      text,
  size       int not null check (size > 0),
  created_at timestamptz not null default now()
);

create index card_batches_user on public.card_batches(user_id, created_at desc);

create table public.cards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  batch_id   uuid references public.card_batches(id) on delete set null,
  -- 8 characters from an unambiguous 31-character alphabet (§22.1).
  code       text not null unique,
  status     text not null default 'available'
             check (status in ('available','assigned','voided')),
  created_at timestamptz not null default now()
);

create index cards_user_status on public.cards(user_id, status);
create index cards_batch on public.cards(batch_id);

-- ---------------------------------------------------------------- policies

alter table public.events       enable row level security;
alter table public.card_batches enable row level security;
alter table public.cards        enable row level security;

create policy events_owner on public.events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy card_batches_owner on public.card_batches
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy cards_owner on public.cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.events       from anon;
revoke all on public.card_batches from anon;
revoke all on public.cards        from anon;
