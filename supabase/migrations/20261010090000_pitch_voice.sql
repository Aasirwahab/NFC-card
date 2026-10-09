-- INSIGNAR: each rep's pitch voice.
--
-- A rep can set, once, how their prospect notes sound, without touching a lead:
--   * pitch_tone  : warm (default), direct or formal. Style only.
--   * pitch_hook  : one sentence in the rep's own words about what they offer. The
--                   pitch may weave it in once, as written; it counts as part of the
--                   business description, so the quality gate treats it as supported.
--   * pitch_avoid : words or phrases the note must never use (checked by the gate).
-- A per-lead style request (sessions.pitch_guidance) still applies on top.

alter table public.profiles
  add column pitch_tone  text not null default 'warm'
    check (pitch_tone in ('warm', 'direct', 'formal')),
  add column pitch_hook  text check (pitch_hook is null or char_length(pitch_hook) <= 140),
  add column pitch_avoid text check (pitch_avoid is null or char_length(pitch_avoid) <= 200);

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
                                      'language', p.language,
                                      'pitch_tone', p.pitch_tone,
                                      'pitch_hook', p.pitch_hook,
                                      'pitch_avoid', p.pitch_avoid)
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
