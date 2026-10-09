-- INSIGNAR — remember which physical sticker was written for each card.
--
-- NFC Helper (a free iPhone app) reports the tag's serial number after a write.
-- Storing it lets us refuse one sticker being written for two cards, and gives a
-- way to tell a genuine sticker from a copied link later. Server-set only, like
-- written_at and verified_at.

alter table public.cards add column tag_uid text
  check (tag_uid is null or tag_uid ~ '^[0-9A-F]{8,32}$');

create unique index cards_tag_uid_unique on public.cards(tag_uid) where tag_uid is not null;

create or replace function public.cards_guard_programming()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if current_user in ('anon', 'authenticated')
     and (new.written_at is distinct from old.written_at
          or new.verified_at is distinct from old.verified_at
          or new.tag_uid is distinct from old.tag_uid) then
    raise exception 'programming_columns_are_server_only' using errcode = '42501';
  end if;
  return new;
end $fn$;
