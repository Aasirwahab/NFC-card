-- Rollback: drop triggers and delivery index before restoring the save function.
-- drop trigger queue_prospect_note_email on public.sessions;
-- drop trigger queue_prospect_note_email on public.profiles;
-- drop function public.queue_prospect_note_email();
-- drop index public.prospect_note_email_once;
-- Then restore the previous save function below BEFORE dropping the columns.
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
--   drop column prospect_consent_at,
--   drop column prospect_answer_token_hash;

-- Prospect input stays separate from the rep's saved contact details. Existing
-- owner RLS and grants on sessions cover these nullable columns unchanged.
alter table public.sessions
  add column prospect_picked_problems text[],
  add column prospect_submitted_email text,
  add column prospect_submitted_phone text,
  add column prospect_consent_at timestamptz,
  add column prospect_answer_token_hash text;

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
                              when s.details_completed_at is null
                                then coalesce(s.prospect_picked_problems, '{}')
                              else '{}'::text[]
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

-- Record delivery through the existing event trail, including retried jobs.
create unique index prospect_note_email_once on public.session_events(session_id, type)
  where type = 'prospect_note_emailed';

-- The fallback note is already readable while enrichment runs. Review holds it
-- until approval, a rep-written pitch, or the rep switching review off.
create function public.queue_prospect_note_email() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_session_id uuid;
  v_user_id uuid;
begin
  if tg_table_name = 'sessions' then
    v_session_id := new.id;
  else
    if new.review_before_live or not old.review_before_live then return new; end if;
    v_user_id := new.id;
  end if;

  insert into public.jobs(type, session_id, user_id)
  select 'prospect_note_email', s.id, s.user_id
    from public.sessions s
    join public.profiles p on p.id = s.user_id
   where (s.id = v_session_id or s.user_id = v_user_id)
     and s.status = 'active'
     and s.details_completed_at is not null
     and s.prospect_submitted_email is not null
     and s.prospect_consent_at is not null
     and (nullif(btrim(s.rep_pitch), '') is not null
          or not p.review_before_live
          or (s.enrichment_status in ('completed', 'failed')
              and s.pitch_approved_revision = s.details_revision))
     and not exists (select 1 from public.session_events e
                      where e.session_id = s.id and e.type = 'prospect_note_emailed')
  on conflict do nothing;
  return new;
end $fn$;
revoke execute on function public.queue_prospect_note_email() from public, anon, authenticated;
grant execute on function public.queue_prospect_note_email() to service_role;

create trigger queue_prospect_note_email
  after update of details_completed_at, rep_pitch, enrichment_status, pitch_approved_revision
  on public.sessions for each row execute function public.queue_prospect_note_email();
create trigger queue_prospect_note_email
  after update of review_before_live on public.profiles
  for each row execute function public.queue_prospect_note_email();
