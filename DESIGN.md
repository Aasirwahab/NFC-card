---
name: INSIGNAR
purpose: Pre-launch landing page and founding-member signup
status: Design direction for Stitch exploration; Aasir owns final design and implementation
version: 1.0
colors:
  paper: "#FAF9F6"
  warm-white: "#F2F0EA"
  white: "#FFFFFF"
  ink: "#191A19"
  graphite: "#282927"
  steel: "#777A78"
  bronze: "#8D7356"
  line: "#D9D7D0"
typography:
  display: Editorial serif, high contrast, legible at small screens
  body: Geometric sans-serif, calm and highly readable
  code: Geist or system sans fallback for technical labels only
  scale-desktop: 72 / 48 / 32 / 20 / 16 / 13 px
  scale-mobile: 40 / 32 / 24 / 20 / 16 / 13 px
  line-height-body: 1.5
  letter-spacing: 0
spacing:
  base: 8px
  section-desktop: 112px
  section-mobile: 64px
  content-max: 1200px
corners:
  cards: 4px
  controls: 4px
motion:
  micro: 180ms
  standard: 240ms
  reveal: 460ms
  easing: cubic-bezier(0.22, 1, 0.36, 1)
---

# INSIGNAR design direction

Use this file as the current visual and interaction direction when exploring the
INSIGNAR pre-launch site in Stitch. Keep the previous concept's editorial intent
and charcoal, warm-white, and bronze palette, while making the overall page
lighter, more distinctive, clearer about the product, and less like a template.
The card is the entry point; the personalized brief and relevant follow-up are
the value. This is a design exploration; it is not approval to publish claims
about unfinished capabilities.

## Product and audience

INSIGNAR helps founders, managing partners, and high-value sales professionals
make an in-person introduction lead to a relevant follow-up. A card opens a
private brief for the person who received it. The intended audience values
discretion, competence, and a considered experience.

The problem to make clear: an introduction often loses its context after the
conversation. A paper or digital card can share contact details, while a generic
follow-up can feel disconnected from what was discussed. INSIGNAR is designed to
carry the context forward: the rep records a private note, and the person they
met opens a brief grounded in their business and the problem they raised.

Primary outcome: apply for one of ten founding places. Secondary outcome: join
the waitlist. In the first screen, explain what INSIGNAR provides, how the
card-to-brief flow works, and why that continuation is useful. Keep both actions
easy to find on a phone.

## Visual direction

- Make warm white, paper, and light neutral surfaces the majority of the page.
  Reserve charcoal for selected product moments, high-contrast sections, and
  footer details. Aim for roughly 65% light and 35% dark across the full page.
- Use bronze as a restrained material detail and steel for quiet secondary
  information. Do not use red, neon, metallic gradients, glow, or gold effects.
- Use a sharp editorial serif for major headlines and a clean sans-serif for
  body copy and controls. Keep line lengths comfortable and hierarchy obvious.
- Generate art-directed product visuals for concept exploration: a restrained
  card beside a phone displaying an anonymised, readable brief. Keep the card
  design generic and avoid implying unconfirmed materials, dimensions, security
  properties, or specifications. Mark generated visuals as concept art in
  handoff notes; replace or approve them before public use.
- Use a distinctive editorial composition, fine rules, intentional whitespace,
  and a few strong images. Avoid template-like repeated cards, stock-photo
  collages, decorative icon grids, generic SaaS feature tiles, and oversized
  pills. Use asymmetry and typography to create a recognizable visual rhythm.
- Design mobile first. Verify at 390px and 1440px widths. Use breakpoint-based
  type sizes rather than viewport-scaled text.

## Motion direction

Motion should make the product feel tactile and guide attention through the
story. Keep it subtle, polished, and brief so it never delays reading or action.

- On first load, reveal the wordmark, headline, supporting copy, and actions in
  sequence over about 500ms. Use opacity and a short 8px upward settle. Keep the
  primary action available immediately.
- As the product demonstration enters view, reveal the card and phone brief
  together. Use a gentle 8-10px rise and crossfade over about 460ms. A subtle
  card-to-phone handoff can run once when the user reaches the section.
- Reveal later content once, with a short 60-90ms stagger between related items.
  Avoid large distances or effects that make content feel like a slideshow.
- Buttons and links may use a 180-220ms color, border, or underline transition.
  Give keyboard focus a clear static outline as well as the motion state.
- A small pointer-responsive highlight or 1-2 degree card tilt is acceptable on
  desktop only. Keep the card stationary on touch devices.
- Do not use looping animations, bouncing elements, pulsing prompts, auto-rotating
  carousels, scroll hijacking, or autoplay video.
- Respect `prefers-reduced-motion`: remove parallax and movement, shorten
  transitions, and show all content immediately. Content must remain visible
  when JavaScript or animation is unavailable.

## Page structure and content

Use the approved copy and section plan in
`docs/handoff/2026-09-25-landing-page-brief.md`. Keep this order unless a
prototype reveals a clear usability reason to adjust it:

1. Compact navigation: wordmark, How it works, The founding ten, Questions,
   Apply.
2. Hero: "Make every introduction worth more." Explain the personal brief in
   one short paragraph. Show Apply for the founding ten and Join the waitlist.
3. Product demonstration: show a clearly conceptual card visual beside an
   anonymised example of the brief it opens. Keep the brief legible and central.
4. Three-step explanation: hand it over, note what mattered, they open their
   brief.
5. Precision over volume: concise comparison, words only, no statistics.
6. The closer's note: the human origin of the product.
7. Discretion: private notes, public business information, no app, privacy link.
8. Founding ten application followed by the email-only waitlist.
9. Short questions and answers.
10. Closing statement: "Your name carries weight." with the application action.

The application asks for role and company, typical deal value, next event and
date, name, and email. The waitlist asks for email, with an optional referrer
field. Show a short purpose/consent note and clear validation, submission,
success, and error states. Do not make form interactions look complete if the
prototype has no persistence.

## Attention and differentiation

- Lead with the recognizable follow-up problem, then show the product resolving
  it. Do not make status, card materials, or vague prestige the headline story.
- Make one memorable product demonstration the visual anchor: the handover leads
  to a private, relevant brief on the recipient's phone.
- Explain the difference with a concise, fair comparison: a basic card shares
  details; a generic follow-up repeats a template; INSIGNAR carries the specific
  conversation into a tailored brief. Avoid claims about named competitors or
  absolute superiority.
- Use contrast, scale, focused movement, and a clear reading path to direct
  attention. Build interest by revealing the brief and its relevance, not by
  manufacturing urgency.
- Avoid fake countdowns, misleading scarcity, fear, shame, hidden terms, or
  other pressure tactics. The founding-ten limit and offer may appear only as
  stated in the approved brief.

## Claims and content boundaries

- Say "brief" or "note" for the prospect experience. Never call it a dossier.
- Describe only capabilities already present in the approved product brief.
- Do not claim AI, CRM integration, interaction memory, meeting preparation,
  deal tracking, forwarded-card alerts, embedded documents, or automated
  opportunity progression as available features.
- Do not invent customer names, testimonials, statistics, conversion results,
  scarcity, certifications, data residency, or guarantees.
- Do not claim steel, custom milling, NTAG424, anti-cloning, or other card
  specifications that have not been confirmed.
- Use fictional, clearly anonymised people and companies in any sample brief.
- Keep the prospect page's existing visual design out of scope for this landing
  page exploration.

## Stitch kickoff prompt

Use this `DESIGN.md` and the approved landing-page brief as the source of truth.
Refine the earlier INSIGNAR concept rather than starting from a generic SaaS
template. Make warm light surfaces the majority, reserve charcoal for deliberate
moments, and use the personalized brief as the product's visual and explanatory
center. Generate concept product visuals with generic, unverified card details;
do not present them as final hardware photography. Use subtle, polished motion
to lead from introduction to brief and then to action. Build the homepage at
mobile and desktop widths with a clickable founding-ten application and waitlist
prototype. Keep every claim within the approved content boundaries. Make the
form states and reduced-motion version visible. Return a short list of unresolved
asset and product questions.

## Review checklist

- The first screen makes the product, audience, and next action understandable.
- The first viewport feels distinctive and makes the offer clear without relying
  on prestige language alone.
- The product demonstration makes the private brief, not the card, the main
  source of value.
- The card and its resulting brief are both legible at phone width.
- Motion supports the narrative, keeps actions responsive, and honors reduced
  motion preferences.
- Application and waitlist paths have clear labels, validation, success, and
  error states.
- No copy, visual, or interaction implies an unbuilt feature or unverified fact.
- Aasir can adapt the direction and retains final design and implementation
  ownership.
