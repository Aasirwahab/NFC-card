-- The rep tap alert (spec §26, Phase 5): "Tom just opened your card".
--
-- The first real view enqueues a notify_tap job in the SAME transaction that sets
-- first_viewed_at. So:
--   - there is exactly one alert per prospect: v_was_first is true once, and
--     jobs_one_live_per_session (session_id, type) turns any race into a no-op;
--   - every §10.4 exclusion is inherited for free: rep self-taps, bots, link
--     previews and repeat views never reach this function at all;
--   - a view can never be recorded without its alert being queued, or the reverse.
--
-- Same signature as before, so `create or replace` keeps the service-role grant.

create or replace function public.record_prospect_view(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_was_first boolean;
  v_user_id   uuid;
begin
  update public.sessions
     set view_count      = view_count + 1,
         first_viewed_at = coalesce(first_viewed_at, now())
   where id = p_session_id
  returning (view_count = 1), user_id into v_was_first, v_user_id;

  if not found then
    return false;
  end if;

  if v_was_first then
    insert into public.session_events(session_id, type)
    values (p_session_id, 'prospect_viewed');

    insert into public.jobs(type, session_id, user_id)
    values ('notify_tap', p_session_id, v_user_id)
    on conflict do nothing;
  end if;

  return v_was_first;
end $fn$;
