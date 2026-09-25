# Landing page brief — 2026-09-25

**From:** Zaid (drafted with Claude)
**For:** Aasir, to design and build. Structure and copy are agreed; **the design is yours.** Push back on anything that doesn't work on the page.
**Status:** pre-launch page for the founding programme. Name **TapLead is a placeholder** and may change.

---

## Who it's for

Founders, CEOs, managing partners and top closers who refuse to be average and are judged on what they close, plus the sales teams they buy for. They respond to restraint, precision and being treated as the only person in the room. They leave at the first sign of anything cheap or gimmicky.

**Sell the follow-up, not the card.** The card is the key; the product is the private brief it opens. Never call it a "digital business card".

## The look: quiet, expensive, precise

- **Dark.** Near-black or deep charcoal base, stark white type, **one muted metallic accent** (brushed steel or bronze). No other colours.
- **Type:** a sharp serif for headlines; a clean geometric sans for everything else. Real hierarchy through size and weight, not colour.
- **Imagery:** only close-up photography of the real card (texture, edge, light) and the real brief on a phone. No stock, no illustrations, no icons-as-decoration, no emoji.
- **Space:** a lot of it. Few words per screen.
- **Motion:** near zero. Slow fades on scroll; nothing bounces, counts up or pulses.
- **Mobile first.** Most visitors arrive from a card on their phone.

## Sections and copy (final unless the design needs a change)

### 1. Navigation

Wordmark · How it works · The founding ten · Questions · **Apply**

### 2. Hero

> # Quiet authority.
>
> Hand over your card. They open a brief written for them alone, grounded in their business, not a template.
>
> **[Apply for the founding ten]** · [Join the waitlist]

Visual: macro photograph of the card on a dark surface.

### 3. The demonstration

> ## Command the room. Even when you're not in it.
>
> Your card opens a private brief for the person you handed it to: their business, the problem they raised, and how you solve it.

Visual: the card beside a phone showing a **real** brief. Use the demo cards from the seed, with anonymised names; never a mock-up of features we don't have. Later (not v1): a visitor types a company name and watches a brief form.

### 4. How it works

> **Hand it over.** The conversation happens as it always does.
> **Note what mattered.** A few words on your phone. They stay private; they're never shown.
> **They open their brief.** When they're ready, on their own time, with a way to book you.

### 5. The difference

> ## Precision over volume.
>
> A paper card holds your details. A digital card holds a link. This holds a brief written for one person.

Three columns, words only, **no statistics.**

### 6. The origin

> ## The closer's note.
>
> A top closer in UK sales wrote, by hand, on the cards that mattered, the one reason that person should call him. We put that note on every card you hand over.

### 7. Discretion

> - Your notes are never shown to the person you met.
> - What it says about their business comes from their own public website.
> - No app. Works with a tap or a scan, on any phone.
> - Link to the privacy page.

### 8. The founding ten

> ## Ten founding members.
>
> We set everything up for you: your cards, your profile, what your business does and how you solve problems. In return, we ask for an honest case study after your next event.
>
> **[Apply for the founding ten]**

Application form (3 questions + contact): _Your role and company_ · _What a typical deal is worth to you_ · _Your next event and its date_ · name, email.
Below it, for everyone else: **waitlist** (email only), plus an optional "Who gave you a card?" field.

### 9. Questions

- _Does the person I meet need an app?_ No. They tap or scan with their phone camera.
- _iPhone and Android?_ Both. Every card carries NFC and a QR code.
- _What if there's no signal at the venue?_ Cards are set up before the event. Nothing needs a connection at the moment you hand one over.
- _What do they actually see?_ A short brief about their business and the problem they raised, from you, with a way to book time.
- _Can it carry my brand?_ Yes. (Founding members: we'll arrange it with you.)
- _What does it cost?_ Pricing is set after the founding programme. Founding members aren't charged.

### 10. Close

> ## Be the one they remember.
>
> **[Apply for the founding ten]**

Footer: How it works · Privacy · © TapLead

---

## Rules

1. **No invented numbers.** No "74%", "3×" or "binned" claims. Real figures appear only after the pilot, with the source.
2. **Only what exists today.** No voice notes, no CRM sync, no "AI" wording, no metal-card promises.
3. **Banned words:** supercharge, game-changer, AI-powered, hack, level up, unlock, revolutionary, synergy, hustle, seamless, simply, "!".
4. **Tracking:** keep `?ref=` from the URL (cards link to `/?ref=card`) and store it with the application or waitlist entry, so we can see which signups came from someone else's card.
5. **Data:** applications and waitlist entries are personal data. Add a one-line consent/purpose note by the form and a deletion path; list it on the privacy page.
6. The **prospect page keeps its current design for now.** Aligning it with this look is a later conversation.

## Needs deciding on your side

- Where applications and the waitlist are stored (a table in this Supabase project, with RLS, is the obvious fit) and how Zaid is notified of a new application.
- Whether `/` replaces the current marketing page or the page lives on its own domain once the name is settled.
