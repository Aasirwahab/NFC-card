# Operator console (`/ops`), PR 1: for Aasir

Staff-only console to issue cards, write each NFC sticker, print the matching QR and see stock. Customers cannot reach it.

## Before it works on Vercel

1. Merge, then apply `supabase/migrations/20261009090000_ops_console.sql` (dry run first).
2. Set `STAFF_EMAILS` (comma list, e.g. `zaid@…,aasir@…`). Empty means nobody is staff.
3. Redeploy. A signed-in non-staff user gets a 404 on `/ops`; signed-out users are sent to sign in.

## What is in this PR

- `lib/auth/staff.ts`, `staff-check.ts`: gate. Every page, layout and server action re-checks it (the proxy is only a convenience redirect).
- Migration: `cards.written_at/verified_at`, `staff_audit_log`, `card_orders` (table only, UI is PR 3), `profiles.low_stock_at`, `ops_reassign_card()`. All new tables are service-role only.
- `/ops` reps and stock, `/ops/users/[id]` issue cards, `/ops/batches/[id]` writing session, `/ops/batches/[id]/print` QR labels (`qrcode` package), `/ops/cards/[code]` lookup.
- `/c/[code]`: a signed-in staff tap on an unused card marks it verified and files nothing (no lead, no view). Repeat staff taps on it are also no-ops. Staff taps on used or lost cards behave like any visit.
- `lib/cards/urls.ts`: one place for the tag link (`/c/CODE`) and QR link (`/c/CODE?src=qr`); the CSV export and `cards:issue` use it too.

## Writing a sticker on iPhone (a web page cannot write NFC on iPhone)

1. `/ops` → rep → Issue cards → writing session.
2. Copy link → NFC Tools → Write → Add a record → URL → paste → Write → hold sticker to the top of the phone.
3. Press "I wrote it", then tap the sticker with the same signed-in phone; the page shows Programmed and moves on.
4. Print the QR sheet, stick each label on the card with the matching code.
   Tips: NTAG213/215 stickers; never on bare metal; lock tags only after verifying (locking is permanent).

## Not in this PR

User detail editing, void/reassign buttons (the SQL exists), reorder requests (`card_orders`), closing the old rep `POST /api/cards/batch`. Planned as PR 2 and 3.

## Checks run

typecheck, 480 tests, eslint, prettier, build, client-bundle leak scan; live: non-staff 404, staff 200, issue, writing page, QR sheet, verify tap, idempotent repeat tap.

## Review round (Antigravity council + own checks)

Fixed before merge: staff now needs a confirmed email; every `/ops` page checks the gate itself (layouts are not a security boundary in the App Router); a rep session cannot write the programming columns (trigger, since a column revoke does nothing under a table-wide grant); audit rows only for writes that changed something; a sticker that is written but not yet verified shows the neutral page to non-staff taps and files nothing; lock warning and print colour fix. Known and left for later: cards count as in stock the moment they are issued (no shipped state), staff cannot void a used card from `/ops`.
