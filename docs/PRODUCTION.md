# Production setup and runbook (as of 2026-10-30)

Where the live app is, what it needs, and what has already bitten us. Secrets are never written here.

## Where it runs

- Live address: **https://insignar.com** (`www` redirects to it). Vercel project **`nfc-card`** in team "Aasir's projects" (Pro plan). Production deploys from `main` automatically. The projects `nfc-card-pnmn` and `nfc-card-s4zm` are spare duplicates; their failed previews are noise and they can be deleted.
- DNS (Namecheap): A `@` to `216.150.1.1` and `216.150.16.1`, CNAME `www` to the Vercel target. Mail (MX) is not set yet.
- Database: shared Supabase project. Migrations through `20261021110000_chat_unanswered` are applied (the dashboard recorded them with its own version numbers, so a future `supabase db` CLI run may report a mismatch).
- Printed cards and QR codes use `NEXT_PUBLIC_APP_URL` (`https://insignar.com/c/<code>`), so treat the domain as permanent.

## Settings in Vercel (production), names only

`MODEL_PROVIDER=openrouter`, `MODEL_API_KEY`, `MODEL_PITCH`, `MODEL_CHAT`, `MODEL_VISION`, `JEV_ENABLED`, `SEARCH_PROVIDER` and `SEARCH_API_KEY` (SerpApi, free tier about 250 searches a month), `STAFF_EMAILS` (opens `/ops`), `NEXT_PUBLIC_APP_URL`, Supabase and Upstash keys, `WORKER_SECRET`, `CRON_SECRET`, `CHAT_ENABLED`, `JOB_CONCURRENCY`, `JOB_BATCH`. **Not set yet:** `RESEND_API_KEY` and `EMAIL_FROM` (email), `MODEL_RESEARCH` (optional). Settings only reach a deployment built after they were saved: redeploy after changing one.

## Known failure modes

- **Jobs stay "queued", pitches never finish.** Cron runs every minute and calls the app back at `NEXT_PUBLIC_APP_URL` (`lib/http/internal.ts`). If that address is unreachable the log shows `post_to_self_failed ... fetch failed`. Fix the setting and redeploy.
- **"Nothing found" on lookups** used to hide every search failure (wrong key, quota, timeout). Since #27 provider failures say "Search is not working right now". A key from one vendor sent to another provider fails the same way: check `SEARCH_PROVIDER` matches the key's vendor.
- **CI "Build" step fails with `Can't resolve '@vercel/turbopack-next/internal/font/google/font'`** is a one-off failure to download Google Fonts on the runner. Re-run the failed job.
- **CI "Database types are in sync" fails**: run `npm run db:types` and commit `lib/db/types.ts`.
- **A work branch created from `origin/main` tracks `main`.** A plain `git push` then updates `main`. Create branches with `git switch -c <name> --no-track origin/main`.

## Checks to run after a deploy

`GET /api/health` (database and redis ok); open `/c/<code>` for a seeded card; `/ops` shows "System checks" all Ready (Search key reads "Ready" when set; it does not test the key); save a lead and watch the pitch finish (about 25 seconds).

## Open items

Resend email, a real NFC tap on a real phone, deleting the two spare Vercel projects, replacing the temporary `STAFF_EMAILS` address with the company one. The daily log of changes is kept in the project's Obsidian notes.
