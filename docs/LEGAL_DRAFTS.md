# Legal drafts for the UK pilot (2026-11-06)

**Status: DRAFT working papers, not legal advice.** Written by an AI assistant from the code and from model research (see the Obsidian note `REVIEWS/2026-11-06-business-scale/m3-antigravity`). Every bracketed item `[LIKE THIS]` is a fact only Zaid can supply. A UK solicitor must read all of this before 30 cards go to real prospects. Nothing here has been sent to anyone.

## 1. What is already true in the product (checked in the code on 2026-11-06)

- **Remove my details** on every prospect page deletes the record at once (`POST /api/landing/[code]/remove`) and voids the card.
- **Automatic deletion:** a daily job (`app/api/cron/jobs/route.ts`) calls `purge_expired_sessions` with `RETENTION_MONTHS` (default 12). It skips records tied to a confirmed or rescheduled booking. Confirm in `/ops` or the logs after the first day that it ran (`retention_purge_failed` is logged on failure).
- **The rep's private "memorable note" never reaches a model.** The one dictated or typed line used to suggest fields does go to the chat model provider, with zero-retention routing asked for (`app/api/capture/note/route.ts`).
- **LinkedIn is never fetched** by the server; only search-result titles and snippets are read, and the rep picks the match.
- The public privacy notice is `/privacy` (updated 2026-11-06 to say where the data comes from).

## 2. Sub-processors to list and sign terms with

| Provider                                       | Does what                                            | Needs                                                |
| ---------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Vercel                                         | Hosting                                              | Accept the standard DPA and UK transfer terms        |
| Supabase                                       | Database, sign-in                                    | DPA; confirm the project region `[REGION]`           |
| OpenRouter + the model makers behind each slug | Writes the pitch, reads the rep's line, answers chat | DPA or terms covering zero retention and US transfer |
| SerpApi                                        | Web search for lookups                               | Check terms: the query holds a name and company      |
| Upstash                                        | Rate limits and job locks (no content)               | Standard DPA                                         |
| Resend                                         | Email (not set up yet)                               | DPA before switching on                              |
| Cal.com                                        | Booking, only if a rep links it                      | The rep's own account; note it in the notice         |

## 3. Pilot terms with a rep's company (draft, one page)

> **INSIGNAR pilot terms.** Between `[INSIGNAR LEGAL ENTITY]` ("INSIGNAR") and `[REP'S COMPANY]` ("the Company"), starting `[DATE]` for `[6 WEEKS]`.
>
> 1. **What you get.** Up to `[10]` numbered cards per rep, access to the INSIGNAR rep app, and support by `[CONTACT]`. The pilot is `[FREE / £X]`.
> 2. **Roles.** `[OPTION A: The Company decides why and how prospect details are used, so it is the controller; INSIGNAR processes them on its behalf and only on its instructions. OPTION B: INSIGNAR is a controller in its own right for the prospect pages it hosts.]` A solicitor chooses A or B.
> 3. **What INSIGNAR does with prospect details.** Stores what the rep captures, looks up public company and LinkedIn links the rep chooses, writes the page, shows the privacy notice, deletes on request or after `[12]` months of no activity.
> 4. **The Company's duties.** Capture only business contact details, tell people who the cards are from, follow the email rules in section 4, and tell INSIGNAR at once if someone asks to be deleted or complains.
> 5. **Providers.** INSIGNAR uses the providers in the current list `[LINK]` and will give notice of changes.
> 6. **Security and incidents.** `[CONTACT]` is told within `[72]` hours of any personal-data incident INSIGNAR becomes aware of.
> 7. **No promises.** The pilot is for learning: no guarantee of uptime or results. Either side may end it by writing.
> 8. **Law.** England and Wales.
>
> Signed `[NAME, DATE]` for each side.

Standard processor clauses (UK GDPR Article 28(3)) must be added by a solicitor if Option A is chosen.

## 4. Rules for reps' follow-up messages (hand to every pilot rep)

1. Say who you are and which company you represent, in every message.
2. **Email to a work address at a company (name@company.co.uk):** fine, in a business context, about what you discussed.
3. **Do not cold-email** a sole trader, a partnership of individuals, or a personal address (gmail, outlook, icloud) unless they gave you their address and asked to hear from you. When unsure, use a LinkedIn message or ask them in person.
4. Every message offers a plain way to stop ("Reply stop and I won't write again"). If someone says stop, tell INSIGNAR and do not message them again.
5. Never put anything in the note or the page you would not say to their face.
6. If a prospect asks you to delete their details: use the "Remove my details" link on their page or tell INSIGNAR the same day.
7. WhatsApp and text count as marketing messages too: only with their agreement.

## 5. Questions to put to the solicitor

1. Is `[REP'S COMPANY]` the controller and INSIGNAR the processor, or is INSIGNAR a controller too, for the hosted pages and lookups? Which pilot terms fit?
2. Is legitimate interests safe for capture plus public-source lookups, and what must the balancing test record?
3. Is our wording for where data comes from (conversation, public web search, company site) enough under Article 14, and is it in the right place (the page the card opens)?
4. Do we need a DPIA for AI-written pages about named people? Is a short screening note enough?
5. Do the model providers' zero-retention settings and DPAs satisfy international-transfer rules, and what do we put in the notice?
6. Does PECR treat a prospect's tap on a card, or an "email me this page" request, as consent for the follow-up that follows?
7. Who is named on the privacy notice (entity, address, contact mailbox) while INSIGNAR has no registered company?
8. ICO registration and fee: needed for us, the rep's company, or both?
