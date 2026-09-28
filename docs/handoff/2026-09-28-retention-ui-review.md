# Retention fix and UI review — 2026-09-28

Status: review only. Branch `codex/retention-booked-sessions` is based on
`zaid/pilot-results`; do not deploy or merge without Zaid and Aasir's review.

## Retention

- `supabase/migrations/20260928090000_followup_and_retention.sql` now excludes
  sessions with confirmed or rescheduled bookings from automatic 12-month purge.
  Cancelled-only bookings do not exempt a session. An index supports that lookup.
- Explicit `delete_session` is unchanged and still deletes linked bookings.
- `tests/integration/schema.test.ts` covers all three booking statuses; the
  existing explicit-deletion test continues to cover erasure.
- Validation: 388 tests, typecheck, lint and Prettier pass locally with PGlite.
  This is not validation against a live Supabase project. Check migration history
  and dry-run on staging before any deployment.
- Policy decision still needed: confirm that cancelled-only bookings are not a
  continuing commercial relationship and define how an ended relationship loses
  its exemption. No relationship-end date exists in the current schema.

## UI/UX handoff for Aasir

The desktop and 390px mobile public home page were rendered locally. The page
works and has no observed overflow, but `app/(marketing)/page.tsx` and
`app/(marketing)/layout.tsx` are still a text-only TapLead placeholder. The
current primary CTA is Sign in, not the founding-ten application. There is no
card/brief imagery, waitlist, or INSIGNAR identity. The approved direction is
already in `docs/handoff/2026-09-25-landing-page-brief.md`; Aasir owns design.

Proposed implementation scope, subject to Zaid's approval:

1. Build the public landing page and shared marketing layout at the two paths
   above to the approved INSIGNAR brief and hero. Keep real product/claims only;
   do not use the Stitch mock-up as a production spec.
2. Add the founding-ten application and waitlist with actual persistence and
   clear success/error states; no decorative or nonfunctional CTAs.
3. Check the real prospect page at `app/c/[code]/prospect-view.tsx` and the rep
   event workflow at `app/(app)/events/` on mobile with seeded/staging data. Do
   not restyle these merely to match the landing page; usability comes first.
4. Verify 390px mobile and desktop layouts, keyboard navigation, form errors,
   and an end-to-end application submission before release.

Before public pilot: Zaid must supply the real controller name and monitored
privacy contact in `app/(marketing)/privacy/page.tsx`, confirm policy wording
and lawful-basis evidence, and have the privacy notice reviewed as planned.

Auth-dependent product screens were not visually audited in this pass because
this isolated worktree has no configured Supabase account or staging seed.
