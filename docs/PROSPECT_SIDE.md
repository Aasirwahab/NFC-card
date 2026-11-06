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
3. **Brief** (details added), "The Quiet Note" (PR #37, 2026-10-31). Greeting first: a large "Hi {first name}" under the rep's photo and name on a pale band, then "A note from {rep}, after {event}". About 0.7 s later the topic line ("About {problem}") and the note fade in; the buttons follow at about 1.3 s. Only the first two paragraphs of the note show; the rest sits under "Read the rest" and a trailing "— {rep}" sign-off always stays visible. One main button (book, else LinkedIn, else "Save {rep}'s contact to follow up about {problem}"), the other actions as quiet rows, then the AI-labelled chat and the footer. The fade-in is skipped for reduced motion, and focus reveals a control at once (a control is never held invisible). Light and dark follow the phone's setting; the palette is cool white with one deep blue (dark: near-black navy, light blue). The rep app stays light.
   - `completed`: the written brief. `crafting`: the template note shows with "Adding the finishing touches". `failed`: the template note (the reader cannot tell). `pending`: a warm generic page.
   - **Held** (rep turned on "review each page before it goes live" and has not approved): a calm "{rep} is preparing this page" screen with no pitch, booking or chat. An open crafting page refreshes into it, and the held page watches for approval.
4. **Removed**: **Remove my details** at the bottom deletes the record (two-step confirm, `POST /api/landing/[code]/remove`, same deletion a rep has) and voids the card.

## What the prospect never sees

The rep's private note (it never reaches a model either), the event label "Unsorted" (shown as no event), other leads, or anything about other cards.

## How the brief is made (AI, with guardrails)

- Pipeline: `lib/enrich/` (snapshot of the lead + the rep's business, research of the prospect's own website only, a prompt, a quality gate). Prompt version `pitch-v4`.
- The gate rejects invented facts, salesy phrasing and anything not backed by what the rep captured; on rejection or model failure the deterministic template (`lib/domain/pitch.ts`) is used. The template claims nothing about experience.
- The playbook is written by the rep and shown as-is; the AI never adds to it.
- **No problem chosen, no claim.** When the lead has no chosen problem (and no typed one), the prompt uses the neutral-note rules (`NO_PROBLEM_RULES` in `lib/enrich/prompts.ts`): say it was good to meet them, say plainly what the business does, invite a short conversation. The gate check `invented_statement` rejects "you mentioned / said / described / flagged ..." in that case, so a slip is retried and then falls back to the template. This exists because a pitch once told a prospect "you mentioned X" when they never had (found live 2026-10-29).
- **Problem chips on every card.** The capture form shows the event's own areas and problems; a card with none (Unsorted, or an event with no problems set up) shows the rep's playbook problems instead (`lib/capture/chips.ts`). Only problems whose chip is on screen are saved. Matching to the playbook entry on this page is by exact problem text, case-insensitive (`playbookFor` in `lib/db/landing.ts`).
- Chat (`/api/chat`): says it is an AI assistant, answers only from the rep's business, the captured problem and the rep's knowledge entries (cap 20,000 characters), capped at 5 questions per card, 500 characters each, kill switch `CHAT_ENABLED`. A question it cannot answer is logged for the rep (Setup lists them with "Add an answer"); a visitor's words are never copied into shared knowledge. A message that is only contact details gets the "I can't pass messages" reply; a question that merely contains an address goes to the model. History is read from the database, never trusted from the browser.
- Model calls go through OpenRouter asking for zero data retention and no collection.

## Environment that changes what a prospect sees

`MODEL_PITCH` / `MODEL_CHAT` (real model ids; production refuses `mock`), `MODEL_API_KEY`, `RESEND_API_KEY` + `EMAIL_FROM` (email-me and tap alerts), `CAL_WEBHOOK_SECRET` (booking links back to the lead), `CHAT_ENABLED`.

## The rep side that feeds this page (capture)

- Typed capture with chips first and one note box; the AI reads the note and suggests an area. **Scan their card** (needs `MODEL_VISION`) fills empty fields; it never overwrites typing: a different value becomes a question ("The card says X. You typed Y." with Use the card's / Keep mine), and "✓ card" shows only while the field still equals the card's value (PR #36).
- A pasted link (LinkedIn profile or website) in Name or Company moves to its own field; typing never triggers this and it never replaces a different value already there.
- LinkedIn and website lookups sit under their fields: one "likely" row plus "Other (n)". LinkedIn is never fetched by the server; search results only. A one-letter name difference is shown but never "Likely". A company typed as `Name.com` is searched as `Name`. If the first two searches find no profile, three looser ones run, unless the first wave was already over about 9 s.

## Try it

1. Sign in as a rep, open a card from Cards, add details (problem chip + name + company).
2. Open `/c/CODE` in a private window on a phone-sized screen: you should see the brief, playbook, booking and the chat button.
3. Press **Remove my details**, confirm, reload: the record is gone and the card shows the portfolio only.

Staff-side setup is in `docs/OPS_CONSOLE.md`.
