# INSIGNAR landing page: how it is wired

- **`/`** shows the new landing page. `next.config.ts` rewrites `/` to `/insignar` (the URL stays `/`). The previous home page is kept at **`/legacy`**; delete `app/legacy` when nobody needs it.
- **`/insignar`** is the page itself: `app/(landing)/insignar/page.tsx`, all copy in `copy.ts`, components in `components/insignar/`, styles in `insignar.css`. `/insignar/transcript` is the text version of the film.
- **The film** is a static file: `public/insignar/film/insignar-v11-16x9.mp4` (27 s, 5.7 MB, voice + sound) with `poster-16x9.jpg`. Played muted by `components/insignar/film-video.tsx`; the 9:16 LinkedIn cut is not on the page.
- **Pilot form** posts to `app/api/insignar/pilot/route.ts`, which saves one row per email in `early_access_requests` (company and team size go into `role`; `ref = insignar-landing`). Rate limited and honeypotted. Read the rows in Supabase (table editor) or with `select * from early_access_requests order by created_at desc`. Nothing is emailed.
- **Dependencies added for the landing:** `gsap`, `@gsap/react` (hero and card motion).
- **Not done yet:** `/privacy` still has placeholders (controller name and email); the domain is pending; a monitored email destination for new requests.
- **Preview locally:** `npm ci && npm run dev`, then open `/` or `/insignar`.

## SEO (set up 2026-10-16)

- `app/(landing)/insignar/page.tsx`: absolute title, description, `robots: index, follow` (the root layout is noindex for the private pages), canonical `/`, Open Graph and Twitter card, JSON-LD (Organization + SoftwareApplication, no ratings/reviews/prices).
- `app/layout.tsx`: `metadataBase` from `NEXT_PUBLIC_APP_URL`. **When the domain arrives, set `NEXT_PUBLIC_APP_URL` to it** (canonical, sitemap, OG image and JSON-LD all follow it).
- `app/robots.ts` and `app/sitemap.ts`; `/c/`, `/ops` and the rep app are disallowed. Social image: `app/(landing)/insignar/opengraph-image.jpg` (1200x630).
- Do after the domain is live: verify in Google Search Console and Bing Webmaster Tools, submit `/sitemap.xml`, add the LinkedIn company page and link it from the site (then add it to `sameAs`).
