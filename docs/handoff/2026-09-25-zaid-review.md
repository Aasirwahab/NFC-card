# Review and pilot-prep changes — 2026-09-25

**From:** Zaid (review done with Claude, plus independent Antigravity passes)
**For:** Aasir, and your Claude. Read this before merging or starting the next phase.
**Base:** `ec6e346` (main). **Branch:** `zaid/pilot-prep`.

Zaid asked us to build the pilot changes on a branch so you can review them and make the calls. Everything below is a proposal: **merge, change or drop any of it.** Nothing on `main` was touched.

---

## Where the project is

| Phase          | State                                                                 |
| -------------- | --------------------------------------------------------------------- |
| 0–3            | Done                                                                  |
| 4              | Done on the mock model. Waiting on a real model id (see Decisions)    |
| 5              | Built. Needs real Resend / Cal.com accounts and real phones to finish |
| 5b field pilot | Next, after this branch                                               |
| 6–8            | Not started                                                           |

The build follows spec v3.0 closely: idempotency, the four render states, rate limiting, the private note never reaching the browser, verbatim-fact research and the claim gate all held up in review. Good work.

## Decisions from Zaid

1. **Model: DeepSeek V4** for pitch, chat and research during the MVP/pilot. The env-based model config makes swapping it later a config change. Hosting location gets revisited for UK GDPR before public launch.
2. **Every card carries an NFC sticker and a printed QR sticker**, both opening `/c/[code]`. Cards are being ordered now.
3. **Cards are activated to an event before it**, on wifi (see #3).
4. **Pricing, billing, retention period and legal wording stay deferred** until after the pilot.

---

## What this branch changes (one commit each)

A 20-scenario walkthrough of real event conditions found three things that break at an event: no signal, a gmail address plus a common company name, and a wrong or unregistered card. These commits cover them, plus the pilot measurements.

| #   | Commit                                                        | What                                                                                                                                                                                                                                                                                                                                                                 | Migration                                                                                                                                |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | `record whether a card was opened by NFC or QR`               | QR encodes `/c/CODE?src=qr`; the first view stores `sessions.first_view_source` (`nfc`/`qr`) and it goes into the `prospect_viewed` event meta. The batch CSV gains a `qr_url` column for printing                                                                                                                                                                   | `20260925090000_view_source` (record_prospect_view gets `p_source`, old signature dropped)                                               |
| 2   | `stop putting a guessed company's facts on the prospect page` | New optional **website** field (stored as the bare host) that outranks the email domain. A **guessed** domain is still researched, but its facts are kept out of the pitch **and** the chat until the rep taps "Yes, use it" in the preview (`POST /api/sessions/[id]/website`)                                                                                      | `20260925091000_prospect_website` (save_session_details + enrichment_snapshot re-created with the field; new `confirm_prospect_website`) |
| —   | `ask the rep for a website when none was found`               | The preview also asks for the website when research found no site at all. The pitch is already written from the problem they raised                                                                                                                                                                                                                                  | —                                                                                                                                        |
| 4   | `email the rep the morning after an event`                    | 08:00 London the day after: registered / opened / booked, every card still needing details (number + colour), and anyone with no follow-up channel. A 48h nudge goes only while details are missing. `queue_event_digests()` runs from the minute cron and is idempotent via `event_digests`                                                                         | `20260925092000_event_digest`                                                                                                            |
| 3   | `release a pre-activated card that was never handed out`      | Only while no details were added and nobody opened it; offered only on the rep view (i.e. tapping the physical card). The card goes back to `available`; the old session is kept as `voided`                                                                                                                                                                         | `20260925093000_release_card`                                                                                                            |
| 6   | `add 'Connect on LinkedIn' to the prospect page`              | The rep's own LinkedIn (Setup) as a button; only real `https://*.linkedin.com` URLs render. Taps are counted as `linkedin_opened`. "Clicked Book" tracking moved into `lib/landing/record-event.ts`, shared, same behaviour                                                                                                                                          | —                                                                                                                                        |
| 1   | `one card, two jobs`                                          | A real card with no live prospect (unregistered, released, or voided after a mix-up) shows the rep's business card: photo, what they do, book a call, save contact, LinkedIn. Unknown codes are still the generic 404 and still count as misses. Every card page ends with **"Get your own TapLead card"** (`/?ref=card`). Save-contact falls back to the card owner | —                                                                                                                                        |
| —   | `say 'registered' in the event email…`                        | Wording fix after combining #3 and #4                                                                                                                                                                                                                                                                                                                                | —                                                                                                                                        |

**Checks on the branch:** `npm test` 366/366 (was 344), `npm run typecheck`, `npm run lint` and prettier all clean. `lib/db/types.ts` regenerated; the new RPCs are added to `scripts/gen-types.ts`, and the schema test's service-role grant list covers them.

**Not verified yet (no Supabase env here):** a real `next build`, the pages in a browser, and `db push` to the project. Please run `npx supabase db push --dry-run` and look at the owner-card page, the preview's website prompt and the rep view's release button on a phone before merging.

---

## Trade-offs for you to decide

1. **Enumeration (§22.2) is relaxed by #1.** A valid code with no live prospect now shows the rep's public page instead of the byte-identical 404, so a valid code looks different from an invalid one. What's shown is only the rep's public profile. The risk is someone noting a valid code and checking back after it's registered. With a 31⁸ code space and the miss limiter, finding one by guessing isn't practical. Your call whether that's acceptable, or whether you'd rather show the owner page only for `available` cards, or add a stricter limit.
2. **`release_card` bends §10.1 (one card, one session, forever).** Residual risk: a card that _was_ handed over, never detailed and not yet opened could be released by mistake and re-registered, and the first holder would then see the next prospect's page. The UI copy asks "Is this card still in your hand?". A stricter rule is possible, e.g. only cards registered in the last 24h, or only before the event date.
3. **The event email counts every active session as "registered"**, including pre-activated cards that were never handed out. The copy says so and suggests releasing them. A proper fix would be a "handed out" marker, which needs a capture step we don't have.
4. **Independent review (Antigravity, read-only) of this branch** found no blocking bugs and confirmed the timezone maths, digest idempotency, function grants, RLS on `event_digests`, and the link/escaping checks. Its lower-severity points, all yours to decide:
   - `save_session_details` rewrites every field, so a genuine partial PATCH nulls the rest. **Pre-existing on `main`** (this branch only adds `prospect_website`); it matters when the Phase 6 outbox sends partial updates.
   - `record_prospect_view` runs in `after()`. If it fails, a card that _was_ opened still looks unopened and could be released (trade-off 2). An old open tab would then also chat into the new session, because `/api/chat` resolves by code. Awaiting the view record, or having the chat carry the session id, would close it.
   - Confirming a website from the preview, then saving a stale details form from another tab, erases the website.
5. **The copy-ready LinkedIn follow-up message** for prospects who haven't tapped is left for your Phase 7 (§19.3 no-tap follow-up); this branch only adds the connect button.

## Flags (low priority, your call)

- Your local `.env.local` has `NEXT_PUBLIC_SUPABASE_SECRET_KEY` (your README notes it). Rename or delete it before anything reads it. **This repository is public**; consider making it private, and keep secrets out of any committed file.
- `lib/security/rate-limit.ts` fails open when Redis is unreachable (deliberate, §24.3). Consider an alert on `rate_limit_unavailable`.

## Zaid's parallel track

Ordering cards and stickers; setting up the DeepSeek key, domain, Resend and Cal.com; drafting the go-to-market plan.

## Questions back

Reply in the PR comments or edit this file.
