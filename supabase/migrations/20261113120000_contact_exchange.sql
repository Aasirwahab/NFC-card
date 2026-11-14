-- Rollback: restore automatic delivery only with the matching application rollback.
-- alter table public.sessions drop column prospect_submitted_message;
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

-- Sharing contact details is optional and authorises a reply from the rep, not an
-- automatic email of their note. Keep explicit Email me this page requests separate.
-- Rollback cannot recover deleted queued jobs or messages.
alter table public.sessions
  add column prospect_submitted_message text
  check (char_length(prospect_submitted_message) <= 300);

drop trigger if exists queue_prospect_note_email on public.sessions;
drop trigger if exists queue_prospect_note_email on public.profiles;
drop function if exists public.queue_prospect_note_email();

delete from public.jobs where type = 'prospect_note_email' and status = 'queued';
