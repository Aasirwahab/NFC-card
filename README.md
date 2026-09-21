# TapLead

A cardboard business card with a penny NFC sticker. The prospect taps it once and
gets a page written for them alone — tied to the problem they described in
conversation, with real facts about their business.

The full specification (`TAPLEAD_BUILD_SPEC.md` v3.0) is the single source of
truth, and is **kept privately rather than in this repository** — it carries
competitive positioning, unit economics and pricing. Ask Zaid for a copy.

Section references throughout this codebase (`§16`, `§22.4`) point into it, and
every decision that shaped the code is quoted inline next to the code it
explains, so the source is readable without it.

---

## Status

| Phase | What                                                                    | State       |
| ----- | ----------------------------------------------------------------------- | ----------- |
| 0     | Foundations — repo, env schema, CI gates, auth                          | **Done**    |
| 1     | Cards and sessions — schema, RLS, `register_card`, `/c/[code]`, capture | **Done**    |
| 2     | The landing page, all four states                                       | **Done**    |
| 3     | The queue — `claim_jobs`, worker routes, cron, reaper                   | Not started |
| 4     | The pipeline — steps 1–7, `safeFetch`, quality gate                     | Not started |
| 5     | Chat, booking, email                                                    | Not started |
| 6     | Offline hardening — service worker, outbox, sync badge                  | Not started |
| 7     | Follow-up and export                                                    | Not started |
| 8     | Physical production and live test                                       | Not started |

The `jobs` table, `claim_jobs` and `complete_enrichment` already exist and are
tested — Phase 3 builds the worker that drains the queue, not the queue itself.

---

## Getting started

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`. Generate the two bearer secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Then:

```bash
npm run dev
```

### The database workflow

Every schema change is a file in `supabase/migrations/`, applied with the CLI.
**Never paste SQL into the dashboard's SQL editor**, in any environment (§11) —
it applies the change but records nothing, so the next `db push` tries to
re-apply it and fails, and the environments quietly drift apart.

The CLI is a pinned dev dependency, so no global install is needed:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase migration new <descriptive_name>   # then write the SQL
npm test                                        # the harness applies it too
npx supabase db push --dry-run                  # see what will run
npx supabase db push
npm run db:types                                # regenerate lib/db/types.ts
```

After a push, check the project's security advisor (Dashboard → Advisors, or
the Supabase MCP `get_advisors`). It is what caught the function-grant bug
fixed in `20260921105702_lock_down_function_execute.sql`.

Enable point-in-time recovery on day one (§24.4) — `cards` and `sessions` cannot
be reconstructed by any means.

---

## Commands

| Command                | Does                                                  |
| ---------------------- | ----------------------------------------------------- |
| `npm run dev`          | Development server                                    |
| `npm run build`        | Runs the env gate, builds, then the secret-leak gate  |
| `npm test`             | Unit and integration suites                           |
| `npm run typecheck`    | `tsc --noEmit`                                        |
| `npm run lint`         | ESLint, including the raw-`fetch` gate                |
| `npm run db:types`     | Regenerate `lib/db/types.ts` from the migrations      |
| `npm run check:env`    | The env schema gate on its own                        |
| `npm run check:bundle` | The secret-leak gate on its own (needs a build first) |

### Testing without Docker

The integration suite applies the real migrations to an in-process PostgreSQL
([PGlite](https://pglite.dev)) and exercises the RPCs against it, so
`npm test` needs no Docker, no Supabase CLI and no cloud project. The same
harness generates `lib/db/types.ts`.

This covers the invariants §9.5 says the schema must enforce — including the
partial unique index that makes the v1 data leak impossible — but it has no
GoTrue and no PostgREST, so the `auth` schema, the Supabase roles and Supabase's
default privileges are shimmed in `tests/integration/harness.ts`.

The shim must never be stricter than production. The first version omitted
Supabase's default grants, so a migration that left every RPC callable by `anon`
passed here and failed on the live project. It is not a substitute for checking
the real project's advisors after a push.

---

## The four CI gates (§25.2)

All four run on every merge, and all four have been verified to fail when they
should:

1. **typecheck · lint · unit** — plus a check that `lib/db/types.ts` is in sync
   with the migrations.
2. **Secret-leak check** — scans every browser-visible file (client chunks _and_
   prerendered HTML) for the service-role key by name and by value. Backed by
   `import 'server-only'` in `lib/db/service.ts`, which makes a client-side
   import a build error.
3. **Raw-fetch check** — ESLint bans `fetch` outside `lib/http`, which is the
   SSRF guard's single entry point (§22.4).
4. **migrate · smoke** — not wired yet: it needs Supabase credentials as
   repository secrets. The comment in `.github/workflows/ci.yml` lists them and
   the exact steps.

The env schema gate runs as `prebuild`, so a missing secret fails the **build**
rather than a request at nine o'clock during an event.

---

## Demo cards

After running the seed, these four codes produce the four render states of §16:

| URL           | State       | What the prospect sees               |
| ------------- | ----------- | ------------------------------------ |
| `/c/DEMXDUNE` | `completed` | The researched pitch                 |
| `/c/DEMXWRKG` | `crafting`  | "Putting something together for you" |
| `/c/DEMXFA23` | `failed`    | The deterministic template pitch     |
| `/c/DEMXPEND` | `pending`   | The warm generic page                |

Open them signed out to see the prospect view, and signed in as the owner to see
the rep view. A rep self-tap deliberately does **not** set `first_viewed_at`.

---

## Decisions taken while building

Points where the spec left a choice open, or where this deviates:

- **No `shadcn/ui` CLI.** The spec lists it for "components you own in-repo".
  The four primitives this needs (`button`, `input`, `textarea`, `field`) are
  hand-written in `components/ui/` instead, which is the same benefit without
  pulling ~15 Radix packages into a page with a two-second LCP budget. Worth
  revisiting when a combobox or a date picker is needed.
- **No browser-side Supabase client at all.** The spec allows the anon key for
  rep auth. Auth runs server-side through `proxy.ts` and Server Actions instead,
  so nothing in the browser ever holds a Supabase client. Slightly tighter than
  §9.2 requires.
- **Types are generated from the migrations**, by `scripts/gen-types.ts`, rather
  than by `supabase gen types`. Same output shape, no CLI or cloud project
  needed. Swap to the official generator whenever it becomes convenient — CI
  checks the file is in sync either way.
- **`lib/http/client.ts` exists** so that the raw-`fetch` ban has no exceptions.
  Same-origin only; it is not `safeFetch` and carries none of its guards.
- **Phase 4/5 secrets are optional in the env schema.** `MODEL_API_KEY`,
  `RESEND_API_KEY` and `CAL_WEBHOOK_SECRET` are marked optional so the app boots
  without them today. Make each one required as its phase lands.
- **No dark mode.** The prospect page is handed to a stranger's phone and has one
  shot at looking deliberate; a second theme is a second thing to get wrong.
- **A fifth `/c/[code]` state: `unavailable`.** Not in the spec. §16 gives four
  render states and a generic 404, but folding "database unreachable" into that
  404 tells someone holding a perfectly good card that it is not active — and
  they throw it away. A query error now renders "Your card is fine — this is on
  us" instead. Still no raw error, and the enumeration guarantee in §22.2 is
  untouched: this state is reachable only by an infrastructure failure, never by
  guessing a code.

## Things Zaid needs to decide or supply

These are flagged in the code with `TODO(zaid)` and in §28 of the spec:

- **`/privacy` placeholders** — registered company name and a monitored contact
  address. The wording should be checked by someone qualified before the product
  is sold (§23).
- **Retention period** — 12 months from last activity is written on the privacy
  page as the spec's defensible default. The Phase 7 purge cron must be built to
  whatever number ends up there.
- **Model provider** (§28) — needed before Phase 4, and it decides whether §23.2
  needs a transfer risk assessment.
- **Supabase, Upstash, Resend and Cal.com accounts**, plus the domain.

## Known gaps left for later phases

- `PATCH /api/sessions/[id]` enqueues the job but nothing drains the queue yet.
  A saved session therefore sits in `crafting` and falls back to the template
  pitch after 90 seconds — which is one of the four designed states, not a
  failure. The `after()` kick is marked `TODO(phase 3)`.
- **Editing a session while its job is `running`** re-queues the session, but the
  in-flight job can still commit the older details afterwards. Harmless today
  because no worker runs; Phase 3 should make the commit check that the job is
  still the live one for that session.
- The booking embed, chat widget and email capture have a reserved slot on the
  prospect page and render nothing until Phase 5. A dead button on the one page
  that gets one chance would be worse than no button.
- Profile photos are an arbitrary URL, not an upload. §22.6's Supabase Storage
  rules apply when that changes.
