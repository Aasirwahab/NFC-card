-- Rollback: restore the previous save function below BEFORE dropping the columns.
-- create or replace function public.save_session_details(
--   p_session_id uuid,
--   p_user_id    uuid,
--   p_details    jsonb
-- ) returns public.sessions
-- language plpgsql
-- security definer
-- set search_path = public, pg_temp
-- as $fn$
-- declare
--   v_session public.sessions;
-- begin
--   update public.sessions s
--      set prospect_name    = nullif(p_details->>'prospect_name', ''),
--          prospect_company = nullif(p_details->>'prospect_company', ''),
--          prospect_email   = nullif(p_details->>'prospect_email', ''),
--          prospect_phone   = nullif(p_details->>'prospect_phone', ''),
--          linkedin_url     = nullif(p_details->>'linkedin_url', ''),
--          niche            = nullif(p_details->>'niche', ''),
--          problems         = coalesce(
--                               array(select jsonb_array_elements_text(p_details->'problems')),
--                               '{}'),
--          custom_problems  = nullif(p_details->>'custom_problems', ''),
--          memorable_info   = nullif(p_details->>'memorable_info', ''),
--          prospect_website = nullif(p_details->>'prospect_website', ''),
--          details_revision      = s.details_revision + 1,
--          details_completed_at  = now(),
--          enrichment_status     = 'queued',
--          enrichment_last_error = null
--    where s.id = p_session_id
--      and s.user_id = p_user_id
--      and s.status = 'active'
--   returning * into v_session;
--
--   if not found then
--     raise exception 'session_not_found' using errcode = 'P0002';
--   end if;
--
--   insert into public.session_events(session_id, type)
--   values (p_session_id, 'details_saved');
--
--   insert into public.jobs(type, session_id, user_id)
--   values ('enrich', p_session_id, p_user_id)
--   on conflict do nothing;
--
--   return v_session;
-- end $fn$;
-- alter table public.sessions
--   drop column prospect_picked_problems,
--   drop column prospect_submitted_email,
--   drop column prospect_submitted_phone,
--   drop column prospect_consent_at;

-- Prospect input stays separate from the rep's saved contact details. Existing
-- owner RLS and grants on sessions cover these nullable columns unchanged.
alter table public.sessions
  add column prospect_picked_problems text[],
  add column prospect_submitted_email text,
  add column prospect_submitted_phone text,
  add column prospect_consent_at timestamptz;

-- The row update locks out concurrent prospect writes once details are saved.
-- Putting the fallback here sends both chip sources through the same pitch path.
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
         problems         = case
                              when jsonb_array_length(coalesce(p_details->'problems', '[]'::jsonb)) > 0
                                then array(select jsonb_array_elements_text(p_details->'problems'))
                              else coalesce(s.prospect_picked_problems, '{}')
                            end,
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

-- session_events.type is unconstrained text; made_with_opened needs no schema change.
