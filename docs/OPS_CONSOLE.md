# Operator console (`/ops`): server-side setup guide

The console is the staff-only side of INSIGNAR. Staff use it to create cards for a rep, write each NFC sticker, print the matching QR label, watch stock and fix rep details. Reps and prospects never see it.

## What it does

| Screen                    | Use                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `/ops`                    | Every rep with cards in stock, handed out, lost, "to write", "to check", low-stock badge, "No profile" warning, card-code search |
| `/ops/users/[id]`         | Edit a rep's details, issue a batch, business summary, staff activity                                                            |
| `/ops/batches/[id]`       | Writing session: one card at a time                                                                                              |
| `/ops/batches/[id]/print` | QR label sheet (35 mm, `/c/CODE?src=qr`)                                                                                         |
| `/ops/cards/[code]`       | Card state, move to another rep, void, write again                                                                               |

## Card lifecycle

1. **Issued** to a rep (`card_batches` + `cards`).
2. **Written**: the sticker holds `https://<app>/c/CODE`. iPhone cannot write NFC from a web page, so the writing page opens the free **NFC Helper** app (`nfchelper://write?url=…&callback=…`). It returns to `/ops/cards/[code]/written?tagid=<serial>`, which marks the card written and stores the sticker's serial (`cards.tag_uid`, unique).
3. **Active**: a signed-in staff tap on the sticker verifies it. The staff tap shows the rep's portfolio with a thin staff banner and files nothing.
4. **Opens the portfolio** for anyone else until the rep adds details. The first public tap files a lead and the card becomes **In use**.
5. **Voided** or **moved** while still unused.

Who sees what on `/c/CODE`: the card's owner signed in gets their own page (register / add details); signed out or another user gets the prospect side; staff first-check shows the portfolio plus banner. A card written but not yet checked shows a neutral page to the public and files nothing.

## Setup

1. **Database.** Apply `20261009090000_ops_console.sql` and `20261009100000_card_tag_uid.sql` (additive only: columns on `cards`/`profiles`, tables `staff_audit_log` and `card_orders`, function `ops_reassign_card`, a trigger that stops a rep's own session writing the programming columns).
2. **Environment.** Set `STAFF_EMAILS` (comma list). Empty means nobody is staff. Staff must have a **confirmed** email. Everything else is the normal app environment (`.env.example`).
3. **Staff login.** Sign in on the same sign-in page; staff land on `/ops`. Everyone else lands on the rep app. Staff see an "Operator console" link in the rep app header.
4. **Phone.** Install **NFC Helper** (free) on the iPhone. Be signed in as staff in **Safari**: the callback opens there.

## Running it separately from the live app (what we did for testing)

The console is part of the same Next.js app and shares the Supabase project, so a separate deployment is simply a second Vercel project built from the same branch:

- Set `NEXT_PUBLIC_APP_URL` to the address that should be written on stickers.
- Remove the per-minute cron from `vercel.json` on a free plan (it is rejected). Without a cron, jobs (tap alerts, briefs) run when a tap kicks the worker; ping `/api/cron/jobs` with the `CRON_SECRET` bearer every few minutes from an external scheduler if that is not enough.
- Turn off Vercel Authentication on the project, or prospects scanning a QR are asked to log in to Vercel.
- **Stickers hold the address forever.** Write real stickers only once the final domain is connected.

## Writing a batch (runbook)

1. `/ops` → the rep → **Issue cards** (count, label).
2. On the writing page tap **Write with NFC Helper**, hold the sticker to the top of the phone. You land back on the page with the card marked written. (Fallback: copy the link, write it in any NFC app, press "I wrote it".)
3. Tap the sticker with the same signed-in phone: "Sticker works: card activated".
4. Print the QR sheet at 100% and stick each label on its card.
5. NTAG213/215 stickers; never on bare metal; lock a tag only after step 3 (locking is permanent).

## Security notes

- Gate: `lib/auth/staff.ts` (confirmed email on the allow-list). Every page, layout, server action and route handler checks it; non-staff get a 404.
- The write callback is a GET that changes state, so it refuses requests another site caused (`Sec-Fetch-Site`), and sends a signed-out visitor to sign in with the callback kept.
- Sign-in redirects only to in-app paths (`lib/auth/safe-next.ts`).
- Every ops write is in `staff_audit_log` (field names only, never values).
- Keep **Secure email change** on in Supabase: the gate trusts the confirmed email.

## Troubleshooting

| Symptom                                            | Cause                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| `/ops` shows 404 after sign-in                     | The login is not in `STAFF_EMAILS`, or its email is not confirmed           |
| Sign-in goes to the rep app                        | Expected for non-staff; check `STAFF_EMAILS` and redeploy after changing it |
| "That sticker is already written for another card" | One sticker cannot hold two cards; use a fresh one                          |
| Callback shows the sign-in page                    | Safari is not signed in as staff                                            |
| Prospect sees "We can't load this right now"       | The card is written but not verified, or the owner has no profile yet       |
| Website / LinkedIn look-up empty                   | `SEARCH_PROVIDER` and key not set; Jev needs `MODEL_API_KEY`                |
| No "scan business card" button                     | `MODEL_VISION` not set                                                      |
| No AI brief on the prospect page                   | `MODEL_PITCH`/`MODEL_CHAT` still `mock` (production refuses mock)           |
