-- TapLead — lock down function execution
--
-- FIXES 20260921000600_functions.sql, which intended "execute is granted to
-- service_role only" but revoked from PUBLIC alone. On Supabase that is not
-- enough: default privileges grant EXECUTE on every new function in public to
-- anon and authenticated EXPLICITLY, so the revoke missed them. The live project's
-- security advisor reported all five SECURITY DEFINER functions as callable at
-- /rest/v1/rpc/* without signing in (lints 0028 and 0029).
--
-- Why that mattered: register_card, save_session_details, void_session and
-- complete_enrichment take the acting user id as an ARGUMENT and bypass RLS by
-- design, because the only intended caller is a route handler that has already
-- verified the rep. Callable by anon, they would let anyone register, edit or void
-- a session, or overwrite the pitch a prospect reads.
--
-- The functions stay in public rather than moving to a private schema: the
-- service role reaches them through PostgREST, which only serves exposed schemas.
-- Access is therefore controlled by GRANT, and this migration makes the grants
-- say what the spec says (§9.2): the service role, and nobody else.

-- ------------------------------------------------ the functions that exist now

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.register_card(uuid, text, uuid, uuid, text, text) to service_role;
grant execute on function public.save_session_details(uuid, uuid, jsonb)          to service_role;
grant execute on function public.void_session(uuid, uuid)                          to service_role;
grant execute on function public.record_prospect_view(uuid)                        to service_role;
grant execute on function public.claim_jobs(text, int)                             to service_role;
grant execute on function public.complete_enrichment(uuid, jsonb, text, text)      to service_role;

-- Trigger functions are checked for EXECUTE when the trigger is created, not when
-- it fires, so revoking from the API roles does not stop updated_at maintenance.
-- Pinning search_path clears Supabase lint 0011: a mutable search_path lets a
-- caller shadow public objects with their own.
alter function public.set_updated_at() set search_path = public, pg_temp;

-- ------------------------------------------- the functions that will exist later
-- A future migration that forgets to revoke must not reopen this hole. These
-- change the defaults for objects created by the role running migrations.
--
-- The PUBLIC revoke has to be global (no IN SCHEMA): Postgres grants EXECUTE to
-- PUBLIC by default everywhere, and a schema-scoped ALTER DEFAULT PRIVILEGES
-- cannot take away a globally granted privilege. Consequence worth knowing: a
-- future helper that an RLS policy calls needs an explicit GRANT to the role the
-- policy runs as.

alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges revoke execute on functions from public;

-- -------------------------------------------------- anon is granted nothing (§11.6)
-- Every table migration so far revoked from anon by hand. Make that the default
-- so the next table cannot be forgotten, and close the bigserial sequences that
-- the defaults granted too.

alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
revoke all on all sequences in schema public from anon;
