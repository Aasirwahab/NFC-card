-- TapLead seed data.
--
-- Phase 2's done-when (§26) is: "each of the four states can be produced on
-- demand and screenshotted". This file is how. It creates four cards with fixed,
-- memorable codes, each bound to a session sitting in one of the four states:
--
--   /c/DEMXDUNE   completed  — the researched pitch, the intended experience
--   /c/DEMXWRKG   crafting   — "Putting something together for you"
--   /c/DEMXFA23   failed     — the deterministic template pitch
--   /c/DEMXPEND   pending    — the warm generic page
--
-- Every code uses only the real 31-character alphabet (§22.1), so they behave
-- exactly like production codes.
--
-- It attaches to the FIRST user in auth.users and does nothing if there is none,
-- so it is safe to run repeatedly and safe to run before signing up. It is also
-- idempotent: running it twice leaves one of each.
--
--   supabase db reset          (applies migrations, then this)
--   psql "$DATABASE_URL" -f supabase/seed.sql

do $seed$
declare
  v_user     uuid;
  v_event    uuid;
  v_card     uuid;
  v_session  uuid;
  v_spec     record;
begin
  select id into v_user from auth.users order by created_at limit 1;

  if v_user is null then
    raise notice 'No user in auth.users — sign up first, then re-run the seed.';
    return;
  end if;

  -- A profile is required: without one there is no rep name to sign the page
  -- with, and resolveCode treats the card as a miss.
  insert into public.profiles (id, full_name, title)
  values (v_user, 'Zaid', 'Founder')
  on conflict (id) do nothing;

  insert into public.business_profiles (user_id, company_name, tagline, services)
  values (
    v_user,
    'TMA',
    'Vertical AI for plant hire and maritime compliance.',
    array[
      'Plant hire automation',
      'Maritime compliance reporting',
      'Subcontractor timesheet reconciliation'
    ]
  )
  on conflict (user_id) do nothing;

  select id into v_event
    from public.events
   where user_id = v_user and name = 'Demo — Plant Hire Expo';

  if v_event is null then
    insert into public.events (user_id, name, location, niches)
    values (
      v_user,
      'Demo — Plant Hire Expo',
      'NEC Birmingham',
      '[
         {"name": "plant hire",
          "problems": ["Idle machine tracking",
                       "Manual timesheets",
                       "Subcontractor reconciliation"]},
         {"name": "maritime compliance",
          "problems": ["IMO reporting deadlines",
                       "Port state control prep",
                       "Crew certification tracking"]}
       ]'::jsonb
    )
    returning id into v_event;
  end if;

  for v_spec in
    select * from (values
      ('DEMXDUNE', 'completed', 'Tom Hargreaves', 'BuildRite Plant'),
      ('DEMXWRKG', 'queued',    'Priya Nair',     'Harbourline Shipping'),
      ('DEMXFA23', 'failed',    'Dan Okafor',     'Meridian Groundworks'),
      ('DEMXPEND', 'pending',   null,             null)
    ) as t(code, status, prospect_name, prospect_company)
  loop
    -- Skip anything already seeded, so this file can be run again safely.
    select id into v_card from public.cards where code = v_spec.code;
    if found then
      continue;
    end if;

    insert into public.cards (user_id, code, status)
    values (v_user, v_spec.code, 'available')
    returning id into v_card;

    v_session := gen_random_uuid();

    perform public.register_card(
      v_session, v_spec.code, v_event, v_user, 'Zaid', split_part(coalesce(v_spec.prospect_name, ''), ' ', 1)
    );

    if v_spec.status <> 'pending' then
      perform public.save_session_details(
        v_session,
        v_user,
        jsonb_build_object(
          'prospect_name',    v_spec.prospect_name,
          'prospect_company', v_spec.prospect_company,
          'niche',            'plant hire',
          'problems',         jsonb_build_array('Idle machine tracking'),
          'memorable_info',   'Arsenal fan, two kids',
          'linkedin_url',     'https://www.linkedin.com/in/example'
        )
      );
    end if;

    if v_spec.status = 'completed' then
      perform public.complete_enrichment(
        v_session,
        '{"signals": ["Operates 40+ excavators across seven depots",
                      "Posted three plant operator roles this quarter"]}'::jsonb,
        'It was good to meet you at the Plant Hire Expo. You mentioned idle machine tracking '
        || 'at BuildRite Plant, and it is the problem we spend most of our time on — across '
        || 'seven depots, the hours a machine sits unbooked are the hours nobody is looking at. '
        || 'We built the reconciliation side of this for a hire firm with a similar depot '
        || 'spread, and the first thing it surfaced was not idle time at all but double-booked '
        || 'transport. The honest answer to whether the same applies to you takes about fifteen '
        || 'minutes to give properly, and I would rather give you a straight one than a '
        || 'brochure. If it is useful, pick a time below. If it is not, no hard feelings — Zaid.',
        'seed'
      );

    elsif v_spec.status = 'failed' then
      -- Attempts spent. The prospect sees the deterministic template pitch and
      -- cannot tell anything went wrong (§16).
      update public.sessions
         set enrichment_status   = 'failed',
             enrichment_attempts = 3,
             enrichment_last_error = 'seeded: model provider unavailable'
       where id = v_session;

      update public.jobs
         set status = 'dead', last_error = 'seeded'
       where session_id = v_session;
    end if;
    -- 'queued' is left exactly as save_session_details left it: the crafting
    -- state, with a real job waiting in the queue for the Phase 3 worker.
  end loop;

  raise notice 'Seeded four demo cards: DEMXDUNE, DEMXWRKG, DEMXFA23, DEMXPEND.';
end $seed$;
