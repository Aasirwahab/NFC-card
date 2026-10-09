# The prospect side (what the person who got the card sees)

The page at `/c/CODE` is what a prospect opens when they tap the card or scan its QR. One address, several states. Nothing here needs the prospect to sign up.

## Who sees what

| Visitor                                         | Sees                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| Anyone signed out, or signed in as another user | The prospect side (below)                                           |
| The card's owner, signed in                     | Their own page: register the card, or add details to its lead       |
| Staff, checking a freshly written sticker       | The portfolio with a thin staff banner; nothing is filed            |
| A card written but not yet checked              | A neutral "can't load right now" page; nothing is filed             |
| An unknown or malformed code                    | The generic "not active" page (counted against a per-visitor limit) |

## The states of the prospect page

1. **Opening screen**: a branded INSIGNAR screen while the page loads (`app/c/[code]/loading.tsx`).
2. **Portfolio** (card has no details yet): the rep's photo, name, title, business, services, booking and save-contact. The first public tap files a lead under the running event (else "Unsorted") and the rep gets a tap alert.
3. **Brief** (details added): a short note about _their_ problem, the rep's playbook entry for that problem (why it happens, up to three things to check, a link), a booking button (the rep's Cal.com link), save contact, LinkedIn connect, email me this page, and an AI-labelled chat.
   - `completed`: the written brief. `crafting`: the template note shows with "Adding the finishing touches". `failed`: the template note (the reader cannot tell). `pending`: a warm generic page.
4. **Removed**: **Remove my details** at the bottom deletes the record (two-step confirm, `POST /api/landing/[code]/remove`, same deletion a rep has) and voids the card.

## What the prospect never sees

The rep's private note (it never reaches a model either), the event label "Unsorted" (shown as no event), other leads, or anything about other cards.

## How the brief is made (AI, with guardrails)

- Pipeline: `lib/enrich/` (snapshot of the lead + the rep's business, research of the prospect's own website only, a prompt, a quality gate). Prompt version `pitch-v2`.
- The gate rejects invented facts, salesy phrasing and anything not backed by what the rep captured; on rejection or model failure the deterministic template (`lib/domain/pitch.ts`) is used. The template claims nothing about experience.
- The playbook is written by the rep and shown as-is; the AI never adds to it.
- Chat (`/api/chat`): says it is an AI assistant, answers only from the rep's business and the captured problem, capped at 5 questions per card, 500 characters each, kill switch `CHAT_ENABLED`. History is read from the database, never trusted from the browser.
- Model calls go through OpenRouter asking for zero data retention and no collection.

## Environment that changes what a prospect sees

`MODEL_PITCH` / `MODEL_CHAT` (real model ids; production refuses `mock`), `MODEL_API_KEY`, `RESEND_API_KEY` + `EMAIL_FROM` (email-me and tap alerts), `CAL_WEBHOOK_SECRET` (booking links back to the lead), `CHAT_ENABLED`.

## Try it

1. Sign in as a rep, open a card from Cards, add details (problem chip + name + company).
2. Open `/c/CODE` in a private window on a phone-sized screen: you should see the brief, playbook, booking and the chat button.
3. Press **Remove my details**, confirm, reload: the record is gone and the card shows the portfolio only.

Staff-side setup is in `docs/OPS_CONSOLE.md`.
