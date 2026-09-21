-- TapLead — performance advisor fixes (Supabase lints 0003 and 0001)
--
-- Both surfaced by the live project's advisor during the first migration check.

-- -------------------------------------------------------- RLS: auth.uid() once
-- A bare auth.uid() in a policy is re-evaluated for every row the query scans.
-- Wrapped in a sub-select, the planner evaluates it once as an InitPlan.
--
-- `to authenticated` is added at the same time: these are ownership policies, so
-- an anon request has nothing to match and should not even evaluate them. anon
-- already holds no table grants (§11.6); this makes the policies say so too.
--
-- RLS remains the backstop, not the main path (§22.6): the application reads and
-- writes through the service role, which bypasses RLS. These policies are what
-- protects the data if anything else ever queries it.

alter policy profiles_owner on public.profiles to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter policy business_profiles_owner on public.business_profiles to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy knowledge_base_owner on public.knowledge_base to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy events_owner on public.events to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy card_batches_owner on public.card_batches to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy cards_owner on public.cards to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy sessions_owner on public.sessions to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy jobs_owner on public.jobs to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Child tables join through sessions. For a FOR ALL policy with no WITH CHECK,
-- Postgres applies USING to writes as well, so ownership holds both ways.
alter policy session_events_owner on public.session_events to authenticated
  using (exists (select 1 from public.sessions s
                  where s.id = session_events.session_id and s.user_id = (select auth.uid())));

alter policy chat_messages_owner on public.chat_messages to authenticated
  using (exists (select 1 from public.sessions s
                  where s.id = chat_messages.session_id and s.user_id = (select auth.uid())));

alter policy bookings_owner on public.bookings to authenticated
  using (exists (select 1 from public.sessions s
                  where s.id = bookings.session_id and s.user_id = (select auth.uid())));

alter policy followup_drafts_owner on public.followup_drafts to authenticated
  using (exists (select 1 from public.sessions s
                  where s.id = followup_drafts.session_id and s.user_id = (select auth.uid())));

-- ------------------------------------------------------- foreign-key indexes
-- Postgres does not index foreign keys. Without these, ON DELETE CASCADE scans
-- the whole child table — and deleting a session is exactly how the right to
-- erasure is honoured (§23), cascading to jobs, events, chat and drafts.
--
-- jobs.session_id already has jobs_one_live_per_session, but that index is
-- partial (queued/running only), so it cannot find the succeeded and dead jobs a
-- cascade must also reach.

create index if not exists bookings_session on public.bookings(session_id);
create index if not exists jobs_session     on public.jobs(session_id);
create index if not exists jobs_user        on public.jobs(user_id);
create index if not exists sessions_event   on public.sessions(event_id);
