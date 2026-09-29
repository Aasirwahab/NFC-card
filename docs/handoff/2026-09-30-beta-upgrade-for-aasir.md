# Beta upgrade: what changed and how to review it (2026-09-30)

**From:** Zaid, with Claude. **For:** Aasir (build lead). Nothing here touches `main`; everything is on stacked branches for your review. **You review and merge; we do not approve our own PRs.** The plain-English version of every change is also in Zaid's notes; this file is the technical map.

## The product in one paragraph

A card (NFC + QR) is issued to a rep. The rep hands it over, walks away, and adds the lead in seconds (say it, or photograph the prospect's card). The prospect taps the card and sees a short note about their own problem, the rep's playbook for it, and ways to book or save the contact. A card with no details shows the rep's portfolio.

## Review order (each PR is based on the one before)

| PR  | Branch               | What                                                                                                                                                                                                                              |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1  | `zaid/pilot-prep`    | pilot fixes, view source (NFC vs QR), owner page, morning digest, release card                                                                                                                                                    |
| #2  | `zaid/pilot-results` | results per event, follow-up drafts, CSV export, deletion, retention purge (with the booking fix)                                                                                                                                 |
| #4  | `zaid/beta-site`     | the static beta landing page in `beta-site/` (separate from the app; host on Vercel, root `beta-site`)                                                                                                                            |
| #5  | `zaid/mvp-rename`    | TapLead to INSIGNAR, warm/coral look, real mark and favicon                                                                                                                                                                       |
| #6  | `zaid/mvp-model-v2`  | **cards are issued to reps; the first tap registers**; event is a label; card code box; lost cards; move a lead between events                                                                                                    |
| #7  | `zaid/mvp-brief-v2`  | pitch prompt v2 and stricter gate, rep photo upload, time zone and spelling per rep, instant note while the AI version is written                                                                                                 |
| #8  | `zaid/mvp-capture`   | zero-retention model routing, **private note removed from every prompt**, AI-labelled chat, LinkedIn never fetched, Jev decision layer, website and LinkedIn finders, **Say it or type it**, **Scan their card**, search failover |
| #9  | `zaid/mvp-prospect`  | try again with guidance, write your own pitch, **playbook**, first-run checklist, tap guide, SerpApi, QA fixes                                                                                                                    |

## Database

Applied on the "NFC card" project as of 09-29: everything up to `20260925093000`. To apply, in order (after merges, `db push --dry-run` first): `20260928090000_followup_and_retention`, `20260929090000_first_tap_and_targets`, `20260929091000_move_session_event`, `20260930090000_profile_locale_and_photo`, `20260930100000_pitch_guidance_and_playbook`. All additive except `requeue_enrichment`, which is dropped and recreated with a defaulted third argument (callers with two arguments keep working). The 09-30 migration also creates a public `avatars` storage bucket. New table `playbook_entries` has RLS on. Types are regenerated with `npm run db:types`.

## New behaviour worth your eyes

- **First tap** (`lib/landing/owner-tap.ts`, `tap_register_card`, `pick_event`): a prospect tapping an unused card creates a lead under the event that is on (the rep's own time zone), else a per-rep `Unsorted`. Same bot and dedupe gates as any tap. Please look for a way a link preview could file a lead.
- **Model calls** (`lib/ai/models.ts`): with `MODEL_PROVIDER=openrouter` every call asks for `zdr` and `data_collection: deny`. The private note (`memorable_info`) is never in a prompt (test in `tests/unit/enrich.test.ts`); the gate still checks output against it. The Vercel AI Gateway path has no equivalent flag yet: your call.
- **Jev** (`lib/jev/*`): a fast decision model over OpenRouter (0.4 s). It only ever sees business-level text: contact details are cut out and person names are blanked. Failure means "no opinion", never an error. Pinned model `typesafe/jev-1.13`.
- **Finders**: `/api/lookup/company` (search then Jev picks the official site; right site in the top 3 for 9 of 10 test companies) and `/api/lookup/linkedin` (search-result text only; **`safeFetch` refuses linkedin.com, lnkd.in, licdn.com**; found the right profile for only 2 of 8 well-known people, so it is labelled a helper and the rep always taps). Search results are not stored; only the tapped link is.
- **Capture** (`/api/capture/note`, `/api/capture/card`): proposals only, nothing saved by them; the card image is never stored or logged; names must appear in the dictated line; uploads are capped before they are read.
- **Playbook**: rep-written, shown to the prospect as written (`playbookFor` in `lib/db/landing.ts`); "Draft it from my notes" uses only the rep's own notes and the rep edits before saving.
- **Draft on the phone**: unsaved lead details are kept in `localStorage` for up to 12 hours (never the private note) and cleared on save.

## Environment (new names are in `.env.example`)

`MODEL_PROVIDER`, `MODEL_VISION`, `JEV_ENABLED`, `JEV_MODEL`, `SEARCH_PROVIDER`, `SEARCH_API_KEY`, `SEARCH_FALLBACK_PROVIDER`, `SEARCH_FALLBACK_API_KEY`. `NEXT_PUBLIC_APP_URL` must be the real https domain: it is written onto every NFC tag. Cal.com needs `CAL_WEBHOOK_SECRET` and the webhook `https://<domain>/api/webhooks/cal` (booking created, rescheduled, cancelled). Resend needs `RESEND_API_KEY`, `EMAIL_FROM` and a verified domain (SPF, DKIM, DMARC). Without Resend the app still runs and logs "email skipped". Zaid creates the accounts; nobody pastes keys in chat or notes.

## Operators

`npm run cards:issue -- --email rep@x.com --count 10 --label "Pilot"` creates a batch for a rep and writes a CSV (`code,url,qr_url,status/print_code`) for NFC writing. Keep the CSV until every tag is written: tags cannot be re-pointed.

## What we would like you to check

1. Read `supabase/migrations` in order and run the dry run. 2. Look at first-tap creation, the ZDR routing and the Jev boundary (above). 3. Confirm Vercel Pro for the minute cron. 4. Decide whether you prefer the AI Gateway (then map the zero-retention setting). 5. Make the repo private (it reports public). 6. Turn on leaked-password protection in Supabase Auth.

## Test on a real phone once it is live

Sign in on **Safari** on an iPhone (a home-screen app keeps a separate login, so a tap on your own card would look like a prospect's). Tap a card: banner, Safari, the card registers and opens its details. Try the say-it box and the card scan. Open the page on a second phone as a prospect: note, playbook block, Save contact, Pick a time, Ask (labelled AI). Check on an Android phone and with a metal case.

## Known limits (deliberate for now)

No offline capture (a draft survives backgrounding, not a dead connection). LinkedIn lookup is a weak helper. Search vendor is SerpApi for now (Serper or Brave can be added as a fallback). Privacy line and "Remove my details" on the prospect page, approve-first for a rep's first 10 notes, and the Event Helper agent are not built yet.

Tests: 459 (`npm test`), typecheck, lint and prettier pass on every branch.
