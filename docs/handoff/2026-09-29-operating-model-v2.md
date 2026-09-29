# Operating model v2 (Zaid, 2026-09-29): handoff for Aasir

Zaid changed how cards reach reps. This branch (`zaid/mvp-model-v2`, stacked on `zaid/mvp-rename` → #2) implements the first half. Nothing here touches `main`.

## The model

- **We issue cards.** Operators create a batch _for a named rep_ and ship it: `npm run cards:issue -- --email rep@x.com --count 10 --label "Pilot"` (service role, reads `.env.local`; writes a CSV with `code, print_code, url, qr_url`). Reps no longer generate batches; the "Generate a batch" screen is gone.
- **Reps do not pre-register cards.** The **first tap** on an unused card creates the session: by the rep (auto-registers, lands on the details screen) or by a prospect (a "tapped, no details" lead + the tap alert). Details are added later under the card, by tap or by typing the **card code**.
- **A card with no details opens the rep's portfolio** (the existing "owner" page), including a session that has no details yet.
- **An event is a label and an optional target.** A first tap files under the event dated today or in the last two days (UK time), else under a per-rep **Unsorted** event (which copies the newest event's niches so the problem chips still work). A lead can be moved to another event from its details screen.
- **Lost cards:** an unused card can be marked lost (voided → portfolio only).

## What changed

| Area                                      | Change                                                                                                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB (`20260929090000…`, `20260929091000…`) | `events.target_cards`; `pick_event`, `tap_register_card` (wraps `register_card`, idempotent), `mark_card_lost`, `move_session_to_event`. All service-role only                                           |
| API                                       | `POST /api/sessions/tap-register`, `POST /api/sessions/[id]/event`, `POST /api/cards/lost`; `/api/sessions/register` kept for the old contract                                                           |
| Landing                                   | `resolveCode`: no session or no details → `owner` page with `ownerId/cardStatus/sessionId`; `lib/landing/owner-tap.ts` files the first tap and records the view (same gates as any tap)                  |
| Rep app                                   | auto-register on tap; card-code box on Today and Cards; Cards = stock / handed out / lost + lost-card form; event target field; lead rows and details header show the printed code; "Filed under" picker |
| Tools                                     | `lib/cards/issue-batch.ts` shared by the route and `scripts/issue-cards.ts`; CSV gains `print_code`                                                                                                      |
| Tests                                     | `tests/integration/first-tap.test.ts` (9 cases); 397 total                                                                                                                                               |

## Please review / decide

1. **Bot and preview safety of first-tap creation.** It uses the existing `isNonHumanAgent` and 60 s per-IP dedupe gates. A messaging-app link preview that is not recognised as a bot would file a "tapped" lead.
2. **`Unsorted` event name** is matched by string in `pick_event`; fine for the pilot, worth a column later.
3. **Offline:** with no registration at handover, the offline PWA outbox is no longer needed for the pilot. What is left is a device-side draft for the details form (not built here). Offline register-by-tap on iPhone (Safari vs installed app) is moot under this model.
4. The migrations are additive. Apply after #1 and #2 (`db push --dry-run` first).

## Gemini review (09-29) and what was done

Fixed: stable session id on the rep's auto-register retry; `pick_event` includes tomorrow and picks the nearest date; one-per-rep `Unsorted` guarded by a unique index; CSV keeps `code,url,qr_url,status` first and appends `print_code` (NFC writers map by column); first-tap dedupe keyed by card; "Tapped by mistake? Put this card back" undo after an accidental auto-register. Known and accepted for the pilot: `pick_event` uses UK time (all pilot reps are in the UK); bulk tapping of unused cards is bounded by the existing per-IP landing limiter.
