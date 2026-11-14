-- Rollback: restore automatic delivery only with the matching application rollback.
-- alter table public.sessions drop column prospect_form_answers;
-- alter table public.profiles drop column contact_form;
-- create function public.queue_prospect_note_email() returns trigger
-- language plpgsql
-- security definer
-- set search_path = public, pg_temp
-- as $fn$
-- declare
--   v_session_id uuid;
--   v_user_id uuid;
-- begin
--   if tg_table_name = 'sessions' then
--     v_session_id := new.id;
--   else
--     if new.review_before_live or not old.review_before_live then return new; end if;
--     v_user_id := new.id;
--   end if;
--
--   insert into public.jobs(type, session_id, user_id)
--   select 'prospect_note_email', s.id, s.user_id
--     from public.sessions s
--     join public.profiles p on p.id = s.user_id
--    where (s.id = v_session_id or s.user_id = v_user_id)
--      and s.status = 'active'
--      and s.details_completed_at is not null
--      and s.prospect_submitted_email is not null
--      and s.prospect_consent_at is not null
--      and (nullif(btrim(s.rep_pitch), '') is not null
--           or not p.review_before_live
--           or (s.enrichment_status in ('completed', 'failed')
--               and s.pitch_approved_revision = s.details_revision))
--      and not exists (select 1 from public.session_events e
--                       where e.session_id = s.id and e.type = 'prospect_note_emailed')
--   on conflict do nothing;
--   return new;
-- end $fn$;
-- revoke execute on function public.queue_prospect_note_email() from public, anon, authenticated;
-- grant execute on function public.queue_prospect_note_email() to service_role;
--
-- create trigger queue_prospect_note_email
--   after update of details_completed_at, rep_pitch, enrichment_status, pitch_approved_revision
--   on public.sessions for each row execute function public.queue_prospect_note_email();
-- create trigger queue_prospect_note_email
--   after update of review_before_live on public.profiles
--   for each row execute function public.queue_prospect_note_email();

-- Rep-configurable contact forms keep immutable answer label snapshots.
-- Sharing contact details is optional and authorises a reply from the rep, not an
-- automatic email of their note. Keep explicit Email me this page requests separate.
-- Rollback cannot recover deleted queued jobs, form configurations or answers.
alter table public.profiles
  add column contact_form jsonb
  check (jsonb_typeof(contact_form) = 'object' and pg_column_size(contact_form) < 8192);

alter table public.sessions
  add column prospect_form_answers jsonb
  check (jsonb_typeof(prospect_form_answers) = 'array' and pg_column_size(prospect_form_answers) < 8192);

drop trigger if exists queue_prospect_note_email on public.sessions;
drop trigger if exists queue_prospect_note_email on public.profiles;
drop function if exists public.queue_prospect_note_email();

delete from public.jobs where type = 'prospect_note_email' and status = 'queued';
