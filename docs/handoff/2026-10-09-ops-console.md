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

## PR 2 (stacked on PR 1: merge #11 first)
- `/ops/users/[id]`: edit name, title, phone, contact email, LinkedIn, Cal.com link, timezone, language, bio and the reorder level; business and playbook summary; recent staff activity. Same validation as the rep's own Setup (shared `lib/schemas/profile.ts`). Email, password and photo are not editable.
- `/ops/cards/[code]`: void an unused card (`mark_card_lost`), move it to another rep (`ops_reassign_card`), or send it back to "needs writing". Used cards are refused with an explanation.
- Audit log records field names changed, never the values. `scripts/gen-types.ts` lists `ops_reassign_card`.
- Checked live with curl against the local stack: edit, bad edit, void, reassign, 404 for non-staff.
