# Production setup and runbook (as of 2026-11-06)

Where the live app is, what it needs, and what has already bitten us. Secrets are never written here.

## Where it runs

- Live address: **https://insignar.com** (`www` redirects to it). Vercel project **`nfc-card`** in team "Aasir's projects" (Pro plan). Production deploys from `main` automatically. The projects `nfc-card-pnmn` and `nfc-card-s4zm` are spare duplicates; their failed previews are noise and they can be deleted.
- DNS (Namecheap): A `@` to `216.150.1.1` and `216.150.16.1`, CNAME `www` to the Vercel target. Mail (MX) is not set yet.
- Database: shared Supabase project. Migrations through `20261021110000_chat_unanswered` are applied (the dashboard recorded them with its own version numbers, so a future `supabase db` CLI run may report a mismatch).
- Code on `main` as of 2026-10-31: `1635ffe` (PRs #32 to #38: faster capture, LinkedIn/website lookups, card scan and reconcile, prospect page redesign). Rollback points are git tags on the repo: `release-pr26` to `release-pr38` (state after each merge), `rollback-2026-10-31-before-pr34`, `-before-pr35`, `-before-compact-capture`, `-before-pr37`, plus Vercel Instant Rollback on any production deploy. No database migration was applied from PR #26 to #38. Draft PR #39 (review fixes) is open and not merged.
- Printed cards and QR codes use `NEXT_PUBLIC_APP_URL` (`https://insignar.com/c/<code>`), so treat the domain as permanent.

## Function region (and why)

`vercel.json` pins functions to `hnd1` (Tokyo). The default is `iad1` (Washington), but the Supabase project is in `ap-northeast-1` (Tokyo), so every auth and database round trip from a function crossed the Pacific (about 150 to 200 ms each, several per signed-in page). Putting the functions next to the database removes that; the cost is that a UK user now makes one longer hop to the function instead of several long hops behind it. Cron jobs run in the same region (the `regions` setting applies to all functions; crons are plain HTTP calls to `/api/cron/jobs`). The Upstash Redis region was not checked: if it is not in Tokyo, rate-limit calls pay the same cost.

Long-term fix: move Supabase and Vercel functions to London (`eu-west-2` / `lhr1`), next to the users. That is a database migration and a Vercel setting change, so it needs Aasir.

## Settings in Vercel (production), names only

`MODEL_PROVIDER=openrouter`, `MODEL_API_KEY`, `MODEL_PITCH`, `MODEL_CHAT`, `MODEL_VISION`, `MODEL_TRANSCRIBE` (optional, voice notes), `JEV_ENABLED`, `SEARCH_PROVIDER` and `SEARCH_API_KEY` (SerpApi, free tier about 250 searches a month), `STAFF_EMAILS` (opens `/ops`), `NEXT_PUBLIC_APP_URL`, Supabase and Upstash keys, `WORKER_SECRET`, `CRON_SECRET`, `CHAT_ENABLED`, `JOB_CONCURRENCY`, `JOB_BATCH`. **Not set yet:** `RESEND_API_KEY` and `EMAIL_FROM` (email), `MODEL_RESEARCH` (optional). Settings only reach a deployment built after they were saved: redeploy after changing one.

## Release: tap first

Before deploying, in this order:

1. Apply `20261106090000_followup_state.sql`, then `20261113000000_prospect_answers.sql`. No additional migration is needed for pilot-request retention; the existing daily purge deletes requests after 12 months without activity.
2. Set `MODEL_TRANSCRIBE` for voice notes (optional; without it the mic button hides).
3. Set `RESEND_API_KEY` and `EMAIL_FROM` for automatic note emails and tap alerts (optional; without them the rep sends from the follow-up list).

To roll back, revert the deploy first, then run the rollback SQL in the migration headers, in reverse order: prospect answers, then follow-up state.

## Voice notes ("Say it once")

Add `MODEL_TRANSCRIBE` in Vercel (needs `MODEL_API_KEY`; redeploy after saving). Unset, the mic button is hidden and reps see "Tip: tap the mic on your keyboard and say it." The browser records up to 60 seconds, converts it to 16 kHz mono WAV, and `POST /api/capture/transcribe` passes it to the model as an audio file part; the words land in the note box and the existing "Sort it for me" read runs on them.

Candidate ids (checked 2026-11-13 against OpenRouter's public models list, which shows audio input for both): `google/gemini-3.5-flash-lite` (cheapest, already the family used for card scans) or `google/gemini-3.8-flash` (better on noisy rooms, probably). Both appear in OpenRouter's zero-data-retention endpoint list. **Not verified:** that a real audio call to either works through our key with `zdr: true`, how accurate they are in a loud room, the cost per note, or that Vercel AI Gateway mode (the default `MODEL_PROVIDER`) passes WAV audio through; the SDK's OpenRouter provider has no transcription model, so this uses a chat model with audio input rather than a speech-to-text endpoint. If a model rejects the audio, the rep sees "Could not turn that into words" and can type.

Audio is never stored: it is held in memory for one call, not written to storage or the database, and not logged (failures log the error type only). The model call uses the same zero-data-retention routing as every other model call. The privacy notice is being updated for voice notes in the same release by another worker; this branch does not change it.

## Known failure modes

- **Jobs stay "queued", pitches never finish.** Cron runs every minute and calls the app back at `NEXT_PUBLIC_APP_URL` (`lib/http/internal.ts`). If that address is unreachable the log shows `post_to_self_failed ... fetch failed`. Fix the setting and redeploy.
- **"Nothing found" on lookups** used to hide every search failure (wrong key, quota, timeout). Since #27 provider failures say "Search is not working right now". A key from one vendor sent to another provider fails the same way: check `SEARCH_PROVIDER` matches the key's vendor.
- **CI "Build" step fails with `Can't resolve '@vercel/turbopack-next/internal/font/google/font'`** is a one-off failure to download Google Fonts on the runner. Re-run the failed job.
- **CI "Database types are in sync" fails**: run `npm run db:types` and commit `lib/db/types.ts`.
- **A work branch created from `origin/main` tracks `main`.** A plain `git push` then updates `main`. Create branches with `git switch -c <name> --no-track origin/main`.

## Checks to run after a deploy

`GET /api/health` (database and redis ok); open `/c/<code>` for a seeded card; `/ops` shows "System checks" all Ready (Search key reads "Ready" when set; it does not test the key); save a lead and watch the pitch finish (about 25 seconds).

## Working rules that came out of the 2026-10-30/31 handover

- Claude covered Aasir's merge and deploy duty on those two days only, with a per-action log in Obsidian; merges need Zaid's explicit yes each time. Vercel settings are never changed without asking. Preview builds fail by design until `NEXT_PUBLIC_APP_URL` is set for previews; `verify` is the check that matters.
- Scan and lookups need `MODEL_VISION` and a search key; locally the throwaway test reps and a mock search are used, never real accounts.

## Open items

Resend email, a real NFC tap on a real phone, deleting the two spare Vercel projects, replacing the temporary `STAFF_EMAILS` address with the company one. The daily log of changes is kept in the project's Obsidian notes.
