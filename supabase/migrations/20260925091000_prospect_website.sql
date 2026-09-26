-- TapLead — stop researching the wrong company (2026-09-25 review)
--
-- A prospect with a gmail address and a common company name ("ABC Services")
-- left the pipeline guessing a domain. The guess is accepted when that site names
-- the company, which is true of EVERY company with that name. The pitch could
-- then quote a stranger's facts to the prospect.
--
-- Two changes on the database side:
--   1. The rep can record the prospect's website. It is the strongest evidence
--      there is, above the work-email domain, because a person typed it.
--   2. confirm_prospect_website: the rep's one-tap "yes, that is their site"
--      from the preview. It writes the site and re-enriches, exactly like a
--      details save, without resending every other field.
-- The pipeline stops putting facts from an UNCONFIRMED guess on the prospect's
-- page (lib/enrich/brief.ts); the guess is kept only to ask the rep.

alter table public.sessions add column prospect_website text;

-- Same function, plus prospect_website. Keeps its signature, so its grant stands.
create or replace function public.save_session_details(
  p_session_id uuid,
  p_user_id    uuid,
  p_details    jsonb
) returns public.sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_session public.sessions;
begin
  update public.sessions s
     set prospect_name    = nullif(p_details->>'prospect_name', ''),
         prospect_company = nullif(p_details->>'prospect_company', ''),
         prospect_email   = nullif(p_details->>'prospect_email', ''),
         prospect_phone   = nullif(p_details->>'prospect_phone', ''),
         linkedin_url     = nullif(p_details->>'linkedin_url', ''),
         niche            = nullif(p_details->>'niche', ''),
         problems         = coalesce(
                              array(select jsonb_array_elements_text(p_details->'problems')),
                              '{}'),
         custom_problems  = nullif(p_details->>'custom_problems', ''),
         memorable_info   = nullif(p_details->>'memorable_info', ''),
         prospect_website = nullif(p_details->>'prospect_website', ''),
         details_revision      = s.details_revision + 1,
         details_completed_at  = now(),
         enrichment_status     = 'queued',
         enrichment_last_error = null
   where s.id = p_session_id
     and s.user_id = p_user_id
     and s.status = 'active'
  returning * into v_session;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  insert into public.session_events(session_id, type)
  values (p_session_id, 'details_saved');

  insert into public.jobs(type, session_id, user_id)
  values ('enrich', p_session_id, p_user_id)
  on conflict do nothing;

  return v_session;
end $fn$;

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
    'rep', (select jsonb_build_object('full_name', p.full_name, 'title', p.title)
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

create function public.confirm_prospect_website(
  p_session_id uuid,
  p_user_id    uuid,
  p_website    text
) returns public.sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_session public.sessions;
begin
  update public.sessions s
     set prospect_website      = nullif(p_website, ''),
         details_revision      = s.details_revision + 1,
         enrichment_status     = 'queued',
         enrichment_last_error = null
   where s.id = p_session_id
     and s.user_id = p_user_id
     and s.status = 'active'
  returning * into v_session;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  insert into public.session_events(session_id, type, meta)
  values (p_session_id, 'website_confirmed', jsonb_build_object('website', p_website));

  insert into public.jobs(type, session_id, user_id)
  values ('enrich', p_session_id, p_user_id)
  on conflict do nothing;

  return v_session;
end $fn$;

revoke execute on function public.confirm_prospect_website(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.confirm_prospect_website(uuid, uuid, text) to service_role;
