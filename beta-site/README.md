# INSIGNAR beta page

A single static page: `index.html` plus `assets/`. No build step, no libraries, no external requests,
no cookies or trackers. Open `index.html` in a browser, or serve the folder locally:
`python3 -m http.server 8765`, then visit http://localhost:8765. Add `#reveal` to the URL to show
every section at once.

## Deploy on Vercel (Aasir)

1. New Project → import this repository.
2. **Root Directory:** `beta-site`. **Framework Preset:** Other. Leave build and output settings empty.
3. Deploy. The included `vercel.json` adds basic security headers.
4. When the domain exists: Project → Settings → Domains → add it, and set the DNS records Vercel shows.

## Before it goes public (Zaid)

Edit the top of `index.html` (search for `insignar-contact`):

- `<meta name="insignar-contact" content="hello@yourdomain">`: a **monitored** address. It appears in the footer and in the privacy note, and is how people ask for their details to be deleted. UK GDPR needs a real contact route.
- `<meta name="insignar-operator" content="...">`: who runs the site, e.g. "INSIGNAR is operated by Full Name". Use the registered company name and number instead once a company exists. Don't write "Ltd" or "Inc" before that.
- **Sign-up form.** Create a form endpoint (Formspree, Tally, or a Supabase edge function) and set `data-endpoint="https://..."` on `<form id="apply">`. It POSTs JSON: `name, email, role, event, ref, source`. Until it's set, the page tells visitors plainly that nothing was sent and never fakes a success.
- Social preview: once the domain is known, make the `og:image` and `twitter:image` URLs absolute (`https://yourdomain/assets/og.png`) and add `<link rel="canonical" href="https://yourdomain/">`.
- Approve or change the example numbers in the calculator (`EX` in the script). They only load when a visitor clicks "Try example numbers", and are labelled as examples.

## Truth table (every claim on the page)

| On the page                                                                                                                                                                                                                                                       | Status                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Private note per person; reads their public website (quotable facts only); page for them with book / ask / save contact / LinkedIn; follow-up draft after a day; note when they open it; morning-after summary; activate cards before the event; NFC + QR, no app | **Prototype** in the product repo (some parts still awaiting review) |
| Meeting-prep briefings; suggested next move; CRM connections; the rep-side company panel                                                                                                                                                                          | **Planned**, marked so on the page                                   |
| "Ten founding members, no charge, we set it up"                                                                                                                                                                                                                   | Founder's decision, 27 Sept 2026                                     |
| Anything not in this table must not go on the page.                                                                                                                                                                                                               |

## Rules the page follows

Headline "Make every introduction worth more."; the recipient's page is a "brief", never a "dossier"; no statistics, testimonials, certifications or hardware specs; no competitor comparisons; fictional people only; interface images labelled "Concept preview"; every capability tagged Prototype or Planned.
