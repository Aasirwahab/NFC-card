-- INSIGNAR: "try again" with guidance, and the rep's playbook.
--
--   * sessions.pitch_guidance: a short style instruction from the rep for the next AI
--     draft ("shorter", "warmer", ...). Style only; never treated as a fact.
--   * requeue_enrichment gains an optional guidance argument (null clears it).
--   * enrichment_snapshot carries it to the writer.
--   * playbook_entries: for each problem the rep hears, why it usually happens, up to
--     three things worth checking, and an optional resource link. Written by the rep,
--     shown to the prospect as-is: the AI never adds to it.

alter table public.sessions
  add column pitch_guidance text
  check (pitch_guidance is null or char_length(pitch_guidance) <= 200);

drop function public.requeue_enrichment(uuid, uuid);

create function public.requeue_enrichment(
  p_session_id uuid,
  p_user_id    uuid,
  p_guidance   text default null
) returns public.sessions
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_session public.sessions;
begin
  select * into v_session from public.sessions
   where id = p_session_id and user_id = p_user_id and status = 'active'
     for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if v_session.details_completed_at is null then
    raise exception 'details_missing' using errcode = 'P0001';
  end if;

  update public.sessions
     set details_revision      = details_revision + 1,
         enrichment_status     = 'queued',
         enrichment_last_error = null,
         pitch_guidance        = nullif(left(btrim(coalesce(p_guidance, '')), 200), '')
   where id = p_session_id
  returning * into v_session;

  insert into public.session_events(session_id, type)
  values (p_session_id, 're_enrich_requested');

  insert into public.jobs(type, session_id, user_id)
  values ('enrich', p_session_id, p_user_id)
  on conflict do nothing;

  return v_session;
end $fn$;

revoke execute on function public.requeue_enrichment(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.requeue_enrichment(uuid, uuid, text) to service_role;

create or replace function public.enrichment_snapshot(p_session_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'session', jsonb_build_object(
      'id',               s.id,
      'user_id',          s.user_id,
      'status',           s.status,
      'details_revision', s.details_revision,
      'prospect_name',    s.prospect_name,
      'prospect_company', s.prospect_company,
      'prospect_email',   s.prospect_email,
      'prospect_website', s.prospect_website,
      'niche',            s.niche,
      'problems',         to_jsonb(s.problems),
      'custom_problems',  s.custom_problems,
      'memorable_info',   s.memorable_info,
      'pitch_guidance',   s.pitch_guidance
    ),
    'rep', (select jsonb_build_object('full_name', p.full_name, 'title', p.title,
                                      'language', p.language)
              from public.profiles p where p.id = s.user_id),
    'business', (select jsonb_build_object(
                          'company_name', b.company_name,
                          'tagline',      b.tagline,
                          'website',      b.website,
                          'services',     to_jsonb(b.services),
                          'pricing',      b.pricing)
                   from public.business_profiles b where b.user_id = s.user_id),
    'knowledge', (select coalesce(jsonb_agg(jsonb_build_object('topic', k.topic, 'content', k.content)
                                            order by k.topic, k.created_at), '[]'::jsonb)
                    from public.knowledge_base k where k.user_id = s.user_id),
    'event', (select jsonb_build_object('name', e.name) from public.events e where e.id = s.event_id)
  )
  from public.sessions s
  where s.id = p_session_id;
$fn$;

-- ------------------------------------------------------------ playbook_entries

create table public.playbook_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  problem      text not null check (char_length(problem) between 2 and 200),
  why          text check (why is null or char_length(why) <= 300),
  checks       text[] not null default '{}'
                 check (cardinality(checks) <= 3),
  resource_url text check (resource_url is null
                           or (resource_url like 'https://%' and char_length(resource_url) <= 300)),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index playbook_one_per_problem on public.playbook_entries (user_id, lower(problem));

create trigger playbook_set_updated_at
  before update on public.playbook_entries
  for each row execute function public.set_updated_at();

alter table public.playbook_entries enable row level security;

create policy playbook_owner on public.playbook_entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
