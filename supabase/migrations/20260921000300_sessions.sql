-- TapLead — sessions, the centre of the system (spec §11.3)
--
-- sessions is the second irreplaceable table (§24.4). The conversation happened
-- once, at a loud event, and the rep has already forgotten it. There is no upstream
-- source to re-import from.

create table public.sessions (
  -- The id is generated on the REP DEVICE, which is what makes an offline retry
  -- idempotent without a dedupe table (§15.4, §17.1).
  id                      uuid primary key,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  card_id                 uuid not null references public.cards(id),
  event_id                uuid not null references public.events(id),

  -- Assigned at registration from the counter on the event row, in the same
  -- transaction. Session properties, not card properties (§10.3).
  event_sequence_number   int  not null,   -- "Card 3"
  colour_tag              text not null,   -- "Blue"

  -- Prospect details, ALL nullable: registration happens before they exist (§10.2).
  prospect_name           text,
  prospect_company        text,
  prospect_email          text,
  prospect_phone          text,
  linkedin_url            text,
  niche                   text,
  problems                text[] not null default '{}',
  custom_problems         text,
  -- The real moat (§5) and the sharp edge (§23.1). Never rendered on the prospect
  -- page, never quoted by the chatbot, excluded from CSV export by default.
  memorable_info          text,

  registered_at           timestamptz not null default now(),
  registered_by           text not null,
  details_completed_at    timestamptz,

  enrichment_status       text not null default 'pending'
     check (enrichment_status in ('pending','queued','processing','completed','failed')),
  enrichment_attempts     int  not null default 0,
  enrichment_started_at   timestamptz,
  enrichment_completed_at timestamptz,
  enrichment_last_error   text,
  research                jsonb,
  generated_pitch         text,
  generated_pitch_model   text,

  -- Set only by a PROSPECT-view render. A rep self-tap is explicitly not a tap
  -- (§10.4) — otherwise every no-tap follow-up is suppressed for every prospect,
  -- the feature silently never fires, and nothing errors.
  first_viewed_at         timestamptz,
  view_count              int  not null default 0,
  chat_response_count     int  not null default 0,

  status                  text not null default 'active'
                          check (status in ('active','voided')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- THE data-leak guard (§11.3). Without it, resolving the landing page by "most
-- recent session for this card" shows an old prospect a newer prospect's name,
-- employer and personal notes. Enforced by Postgres, not by application discipline.
create unique index sessions_one_active_per_card
  on public.sessions(card_id) where status = 'active';

create index sessions_user_event on public.sessions(user_id, event_id);
create index sessions_enrichment_pending on public.sessions(enrichment_status)
  where enrichment_status in ('queued','processing');
-- Drives the daily no-tap sweep (§19.3).
create index sessions_not_viewed on public.sessions(registered_at)
  where first_viewed_at is null and status = 'active';

create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

alter table public.sessions enable row level security;

create policy sessions_owner on public.sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.sessions from anon;
