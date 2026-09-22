-- The rep sees the pitch first (spec §14.5): preview, optional edit, rating.
--
-- Three decisions shape this migration:
--
--   1. The rep's edit lives in its OWN column, rep_pitch. generated_pitch stays
--      exactly what the model wrote, so a re-enrich can never overwrite the rep's
--      words (it only ever writes generated_pitch), and ratings keep judging what
--      the model actually produced. The landing page shows rep_pitch when set.
--
--   2. Ratings are a table, not columns on sessions. A re-enrich writes a new
--      pitch; a single rating column would either be wiped (losing the tuning
--      data §14.5 exists to collect) or silently judge the wrong pitch. One row
--      per (session, pitch text) keeps every judgement with the text it judged.
--
--   3. Every pitch records the prompt version that wrote it, so ratings can be
--      grouped by prompt as well as by model.

alter table public.sessions
  add column rep_pitch              text
    check (rep_pitch is null or char_length(rep_pitch) between 1 and 4000),
  add column rep_pitch_edited_at    timestamptz,
  add column generated_pitch_prompt text;

-- ------------------------------------------------------------ pitch_ratings

create table public.pitch_ratings (
  id         bigserial primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- The exact text that was judged. Carries the prospect's name, like the session
  -- it belongs to, and is deleted with it (cascade).
  pitch      text not null,
  model      text,
  prompt     text,
  rating     smallint not null check (rating in (-1, 1)),
  reason     text check (reason is null or char_length(reason) <= 500),
  rated_at   timestamptz not null default now()
);

-- One judgement per pitch text: rating the same pitch again replaces it.
create unique index pitch_ratings_one_per_pitch
  on public.pitch_ratings(session_id, md5(pitch));
-- Foreign-key index (Supabase lint 0001).
create index pitch_ratings_user on public.pitch_ratings(user_id);

alter table public.pitch_ratings enable row level security;

create policy pitch_ratings_owner on public.pitch_ratings
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.pitch_ratings from anon;
revoke all on sequence public.pitch_ratings_id_seq from anon;

-- ----------------------------------------------------- complete_enrichment

-- Unchanged except for p_prompt, recorded alongside the model.
drop function if exists public.complete_enrichment(uuid, jsonb, text, text, int);

create function public.complete_enrichment(
  p_session_id uuid,
  p_research   jsonb,
  p_pitch      text,
  p_model      text,
  p_revision   int  default null,
  p_prompt     text default null
) returns text
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_session public.sessions;
begin
  select * into v_session from public.sessions where id = p_session_id for update;

  if not found then return 'missing'; end if;
  if v_session.status <> 'active' then return 'inactive'; end if;
  if p_revision is not null and v_session.details_revision <> p_revision then return 'stale'; end if;
  if v_session.enrichment_status = 'completed' then return 'replay'; end if;

  update public.sessions
     set enrichment_status       = 'completed',
         research                = p_research,
         generated_pitch         = p_pitch,
         generated_pitch_model   = p_model,
         generated_pitch_prompt  = p_prompt,
         enrichment_completed_at = now(),
         enrichment_last_error   = null
   where id = p_session_id;

  insert into public.session_events(session_id, type, meta)
  values (p_session_id, 'enrichment_completed',
          jsonb_build_object('model', p_model, 'prompt', p_prompt));

  return 'committed';
end $fn$;

-- ------------------------------------------------------------ set_rep_pitch

-- Sets the rep's edit, or clears it when p_text is null ("go back to the
-- generated pitch"). Scoped by user_id, like every rep write (§22.6).
create function public.set_rep_pitch(
  p_session_id uuid,
  p_user_id    uuid,
  p_text       text
) returns public.sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_session public.sessions;
  v_text    text := nullif(btrim(p_text), '');
begin
  update public.sessions s
     set rep_pitch           = v_text,
         rep_pitch_edited_at = case when v_text is null then null else now() end
   where s.id = p_session_id
     and s.user_id = p_user_id
     and s.status = 'active'
  returning * into v_session;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  insert into public.session_events(session_id, type)
  values (p_session_id, case when v_text is null then 'pitch_reset' else 'pitch_edited' end);

  return v_session;
end $fn$;

-- --------------------------------------------------------------- rate_pitch

-- Rates the pitch the MODEL wrote — never the rep's own edit, which would only
-- measure the rep. Re-rating the same pitch replaces the earlier judgement.
create function public.rate_pitch(
  p_session_id uuid,
  p_user_id    uuid,
  p_rating     smallint,
  p_reason     text
) returns public.pitch_ratings
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_session public.sessions;
  v_row     public.pitch_ratings;
begin
  select * into v_session
    from public.sessions
   where id = p_session_id and user_id = p_user_id and status = 'active';

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if v_session.generated_pitch is null then
    raise exception 'nothing_to_rate' using errcode = 'P0001';
  end if;

  insert into public.pitch_ratings
    (session_id, user_id, pitch, model, prompt, rating, reason)
  values
    (p_session_id, p_user_id, v_session.generated_pitch, v_session.generated_pitch_model,
     v_session.generated_pitch_prompt, p_rating, nullif(btrim(p_reason), ''))
  on conflict (session_id, md5(pitch)) do update
     set rating   = excluded.rating,
         reason   = excluded.reason,
         rated_at = now()
  returning * into v_row;

  return v_row;
end $fn$;

-- ---------------------------------------------------------------- grants

-- Default privileges already withhold execute from anon and authenticated
-- (20260921105702); only the service role, which the routes use, gets it.
grant execute on function public.complete_enrichment(uuid, jsonb, text, text, int, text) to service_role;
grant execute on function public.set_rep_pitch(uuid, uuid, text)                          to service_role;
grant execute on function public.rate_pitch(uuid, uuid, smallint, text)                   to service_role;
