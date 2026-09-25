-- TapLead — which sticker was used: NFC or QR (pilot measurement)
--
-- Every card carries an NFC sticker AND a printed QR sticker, both opening
-- /c/CODE. The QR encodes /c/CODE?src=qr, so the first real view can record which
-- one the prospect used. The field pilot needs this to tell whether prospects tap
-- or scan, and whether a dead NFC sticker is being rescued by the QR.
--
-- 'nfc' means "not the QR": the NFC tag, a typed URL or a forwarded link all
-- arrive without ?src=qr. Only the FIRST view's source is kept on the session;
-- it is the one that answers "how did this card get opened".

alter table public.sessions
  add column first_view_source text
    check (first_view_source in ('nfc', 'qr'));

-- A new parameter changes the signature, so the old function is dropped rather
-- than overloaded: two record_prospect_view functions would make a call with one
-- argument ambiguous.
drop function public.record_prospect_view(uuid);

create function public.record_prospect_view(p_session_id uuid, p_source text default 'nfc')
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_was_first boolean;
  v_user_id   uuid;
  v_source    text := case when p_source = 'qr' then 'qr' else 'nfc' end;
begin
  -- SET expressions read the row as it was before this update, so the source is
  -- written exactly when first_viewed_at is.
  update public.sessions
     set view_count        = view_count + 1,
         first_view_source = case when first_viewed_at is null then v_source
                                  else first_view_source end,
         first_viewed_at   = coalesce(first_viewed_at, now())
   where id = p_session_id
  returning (view_count = 1), user_id into v_was_first, v_user_id;

  if not found then
    return false;
  end if;

  if v_was_first then
    insert into public.session_events(session_id, type, meta)
    values (p_session_id, 'prospect_viewed', jsonb_build_object('source', v_source));

    insert into public.jobs(type, session_id, user_id)
    values ('notify_tap', p_session_id, v_user_id)
    on conflict do nothing;
  end if;

  return v_was_first;
end $fn$;

revoke execute on function public.record_prospect_view(uuid, text) from public, anon, authenticated;
grant  execute on function public.record_prospect_view(uuid, text) to service_role;
