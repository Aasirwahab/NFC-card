-- TapLead — identity and business configuration (spec §11.1)
--
-- RLS is enabled on every table and written against auth.uid() from day one, even
-- though v1 has a single user: retro-fitting tenancy to a live database is the
-- expensive version of this work (§11.6).

-- ---------------------------------------------------------------- helpers

-- Keeps updated_at honest without the application having to remember.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null,
  title        text,
  bio          text,
  photo_url    text,
  linkedin_url text,
  phone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------- business_profiles

create table public.business_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  tagline      text,
  logo_url     text,
  website      text,
  services     text[] not null default '{}',
  pricing      jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index business_profiles_user on public.business_profiles(user_id);

create trigger business_profiles_set_updated_at
  before update on public.business_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------- knowledge_base

create table public.knowledge_base (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  topic      text not null,
  content    text not null,
  source     text not null default 'manual'
             check (source in ('manual','url_import','pdf_import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_base_user_topic on public.knowledge_base(user_id, topic);

create trigger knowledge_base_set_updated_at
  before update on public.knowledge_base
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- policies

alter table public.profiles          enable row level security;
alter table public.business_profiles enable row level security;
alter table public.knowledge_base    enable row level security;

create policy profiles_owner on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy business_profiles_owner on public.business_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy knowledge_base_owner on public.knowledge_base
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The anon role is granted nothing (§11.6). Public traffic — the landing page, the
-- chatbot, webhooks — is served by route handlers holding the service-role key.
-- There is no path by which a browser reads these tables directly, and that is what
-- keeps prospect names and personal notes safe.
revoke all on public.profiles          from anon;
revoke all on public.business_profiles from anon;
revoke all on public.knowledge_base    from anon;
