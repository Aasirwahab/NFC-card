-- INSIGNAR — beta upgrade: not UK-only, and reps upload their own photo.
--
--   * profiles.timezone (IANA name) and profiles.language ('en-GB' or 'en-US'):
--     which day "today" is for a first tap, and which spelling the pitch uses.
--     Set from the phone; editable in Setup.
--   * pick_event reads the rep's time zone instead of a hard-coded London.
--   * enrichment_snapshot carries the language to the pitch prompt.
--   * a public `avatars` storage bucket for profile photos (skipped where the
--     storage schema does not exist, e.g. the in-process test database).

alter table public.profiles
  add column timezone text not null default 'UTC'
    check (char_length(timezone) between 1 and 64),
  add column language text not null default 'en-GB'
    check (language in ('en-GB', 'en-US'));

-- ------------------------------------------------------------- pick_event

create or replace function public.pick_event(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_tz    text;
  v_today date;
  v_id    uuid;
begin
  select timezone into v_tz from public.profiles where id = p_user_id;
  begin
    v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;
  exception when others then
    -- An unrecognised zone name must never stop a first tap.
    v_today := (now() at time zone 'UTC')::date;
  end;

  select id into v_id
    from public.events
   where user_id = p_user_id
     and name <> 'Unsorted'
     and event_date between v_today - 2 and v_today + 1
   order by abs(event_date - v_today), event_date desc, created_at desc
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.events (user_id, name, niches)
  values (
    p_user_id,
    'Unsorted',
    coalesce(
      (select niches from public.events
        where user_id = p_user_id order by created_at desc limit 1),
      '[]'::jsonb)
  )
  on conflict (user_id) where name = 'Unsorted' do nothing
  returning id into v_id;
  if v_id is not null then
    return v_id;
  end if;

  select id into v_id
    from public.events
   where user_id = p_user_id and name = 'Unsorted';
  return v_id;
end $fn$;

-- ------------------------------------------------------ enrichment_snapshot

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
      'memorable_info',   s.memorable_info
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

-- ------------------------------------------------------------ avatars bucket

do $do$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    -- Public read, because the photo is shown on a page any prospect may open.
    -- Writes go only through the server (service role); no storage policy grants a
    -- browser client anything.
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 1048576, array['image/jpeg'])
    on conflict (id) do nothing;
  end if;
end $do$;
