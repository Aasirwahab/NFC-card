-- TapLead — supporting tables (spec §11.5)

-- Append-only audit and analytics trail. Also the debugging tool: it answers
-- "what happened to this lead" without reading logs (§24.1).
create table public.session_events (
  id          bigserial primary key,
  session_id  uuid not null references public.sessions(id) on delete cascade,
  type        text not null,
  occurred_at timestamptz not null default now(),
  meta        jsonb
);

create index session_events_session on public.session_events(session_id, occurred_at);

create table public.chat_messages (
  id         bigserial primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

create index chat_messages_session on public.chat_messages(session_id, created_at);

create table public.bookings (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid references public.sessions(id) on delete set null,
  provider          text not null default 'cal.com',
  provider_event_id text not null,
  prospect_email    text,
  prospect_name     text,
  starts_at         timestamptz,
  status            text not null default 'confirmed'
                    check (status in ('confirmed','cancelled','rescheduled')),
  created_at        timestamptz not null default now()
);

-- A replayed webhook delivery updates rather than duplicates (§19.1).
create unique index bookings_provider_event
  on public.bookings(provider, provider_event_id);

create table public.followup_drafts (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id) on delete cascade,
  channel      text not null check (channel in ('linkedin','email','none')),
  draft_text   text not null,
  sent_at      timestamptz,
  generated_at timestamptz not null default now()
);

-- The unique index means the no-tap cron can run twice without producing two
-- drafts (§19.3).
create unique index followup_drafts_one_per_session
  on public.followup_drafts(session_id);

-- ---------------------------------------------------------------- policies
-- Child tables join through sessions (§11.6).

alter table public.session_events  enable row level security;
alter table public.chat_messages   enable row level security;
alter table public.bookings        enable row level security;
alter table public.followup_drafts enable row level security;

create policy session_events_owner on public.session_events
  for all using (exists (
    select 1 from public.sessions s
     where s.id = session_events.session_id and s.user_id = auth.uid()
  ));

create policy chat_messages_owner on public.chat_messages
  for all using (exists (
    select 1 from public.sessions s
     where s.id = chat_messages.session_id and s.user_id = auth.uid()
  ));

create policy bookings_owner on public.bookings
  for all using (exists (
    select 1 from public.sessions s
     where s.id = bookings.session_id and s.user_id = auth.uid()
  ));

create policy followup_drafts_owner on public.followup_drafts
  for all using (exists (
    select 1 from public.sessions s
     where s.id = followup_drafts.session_id and s.user_id = auth.uid()
  ));

revoke all on public.session_events  from anon;
revoke all on public.chat_messages   from anon;
revoke all on public.bookings        from anon;
revoke all on public.followup_drafts from anon;
