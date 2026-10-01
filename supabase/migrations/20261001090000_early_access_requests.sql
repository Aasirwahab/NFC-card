-- INSIGNAR — early access requests from the public home page.
--
-- The home page asks people to apply for the founding group. A request is
-- personal data from someone with no account, so:
--   * service role only: the server action writes it, nothing in the app reads
--     it, and anon/authenticated are granted nothing;
--   * every field is length-capped here, not just in the form;
--   * one row per email: applying again updates the row instead of adding one;
--   * `ref` keeps where they came from (cards link to /?ref=card).
-- Deletion is by request (the privacy page says how): delete the row.

create table public.early_access_requests (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  email      text not null unique
               check (char_length(email) between 3 and 254 and email = lower(email)),
  role       text check (role is null or char_length(role) <= 200),
  next_event text check (next_event is null or char_length(next_event) <= 200),
  ref        text check (ref is null or char_length(ref) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger early_access_set_updated_at
  before update on public.early_access_requests
  for each row execute function public.set_updated_at();

alter table public.early_access_requests enable row level security;
-- Service role only: nothing in the app reads this table directly.
revoke all on public.early_access_requests from anon, authenticated;
