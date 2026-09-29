'use client';

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { COLOUR_HEX, type ColourTag } from '@/lib/domain/colours';
import type { Niche } from '@/lib/db/rep';
import type { Row } from '@/lib/db/types';
import { LookupPicker } from '@/components/lookup-picker';
import { shrinkToJpeg } from '@/lib/browser/image';
import type { CardFields } from '@/lib/capture/card';
import type { NoteFill } from '@/lib/capture/note';
import type { SiteLookup } from '@/lib/lookup/company';
import type { ProfileLookup } from '@/lib/lookup/linkedin';
import { printedCode } from '@/lib/cards/issue-batch';
import { apiSend, apiUpload } from '@/lib/http/client';
import { hasNoFollowUpChannel } from '@/lib/schemas/sessions';

/**
 * The capture form (spec §10.2, §21).
 *
 * "The capture form is the one screen that must never feel slow." Everything is
 * local state; there is exactly one network call, on save. In Phase 6 the outbox
 * slides underneath this without the form changing: the save writes locally
 * first, the UI confirms from the local write, and the flush happens later
 * (§17.1). The session id already comes from the device, which is the part of
 * that contract that had to be right from the start.
 */

type Session = Row<'sessions'>;

export function DetailsForm({
  session,
  niches,
  eventName,
  cardCode,
  events,
  lookupEnabled,
  scanEnabled,
  justRegistered,
}: {
  session: Session;
  niches: Niche[];
  eventName: string | null;
  /** The printed code of the card, the handle for this lead. */
  cardCode: string;
  events: { id: string; name: string }[];
  /** True when a search provider is configured, so the "find it" buttons can work. */
  lookupEnabled: boolean;
  /** True when a card-reading model is configured. */
  scanEnabled: boolean;
  justRegistered: boolean;
}) {
  const router = useRouter();

  const [name, setName] = useState(session.prospect_name ?? '');
  const [company, setCompany] = useState(session.prospect_company ?? '');
  const [website, setWebsite] = useState(session.prospect_website ?? '');
  const [email, setEmail] = useState(session.prospect_email ?? '');
  const [phone, setPhone] = useState(session.prospect_phone ?? '');
  const [linkedin, setLinkedin] = useState(session.linkedin_url ?? '');
  const [niche, setNiche] = useState(session.niche ?? niches[0]?.name ?? '');
  const [problems, setProblems] = useState<string[]>(session.problems ?? []);
  const [customProblems, setCustomProblems] = useState(session.custom_problems ?? '');
  const [memorable, setMemorable] = useState(session.memorable_info ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // The newest field values, for callbacks that finish later (a scan, a lookup): a
  // callback made at click time would otherwise see the form as it was then.
  const latest = useRef({
    name,
    company,
    website,
    email,
    phone,
    customProblems,
    problemCount: problems.length,
  });
  useEffect(() => {
    latest.current = {
      name,
      company,
      website,
      email,
      phone,
      customProblems,
      problemCount: problems.length,
    };
  });

  // An unsaved draft survives the phone locking, the app being backgrounded to check a
  // face on LinkedIn, or the tab being reclaimed. Kept on this phone only, never the
  // private note, and cleared once the lead is saved.
  const draftKey = `insignar:draft:${session.id}`;
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (session.details_completed_at) return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as Record<string, unknown>;
      // A draft older than 12 hours is dropped: it holds a prospect's details.
      if (typeof d.savedAt !== 'number' || Date.now() - d.savedAt > 12 * 60 * 60 * 1000) {
        window.localStorage.removeItem(draftKey);
        return;
      }
      startTransition(() => {
        if (typeof d.name === 'string') setName(d.name);
        if (typeof d.company === 'string') setCompany(d.company);
        if (typeof d.website === 'string') setWebsite(d.website);
        if (typeof d.email === 'string') setEmail(d.email);
        if (typeof d.phone === 'string') setPhone(d.phone);
        if (typeof d.linkedin === 'string') setLinkedin(d.linkedin);
        if (typeof d.niche === 'string' && d.niche) setNiche(d.niche);
        if (Array.isArray(d.problems))
          setProblems(d.problems.filter((p): p is string => typeof p === 'string'));
        if (typeof d.customProblems === 'string') setCustomProblems(d.customProblems);
        setRestored(true);
      });
    } catch {
      /* no draft, or storage unavailable */
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (session.details_completed_at) return;
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({
            savedAt: Date.now(),
            name,
            company,
            website,
            email,
            phone,
            linkedin,
            niche,
            problems,
            customProblems,
          }),
        );
      } catch {
        /* storage unavailable: the draft is a convenience */
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [
    draftKey,
    session.details_completed_at,
    name,
    company,
    website,
    email,
    phone,
    linkedin,
    niche,
    problems,
    customProblems,
  ]);
  const clearDraft = () => {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  };

  const setSiteApi = useCallback((api: { run: (o?: Record<string, unknown>) => void }) => {
    siteLookup.current = api;
  }, []);
  const setProfileApi = useCallback((api: { run: (o?: Record<string, unknown>) => void }) => {
    profileLookup.current = api;
  }, []);

  const siteLookup = useRef<{ run: (o?: Record<string, unknown>) => void } | null>(null);
  const profileLookup = useRef<{ run: (o?: Record<string, unknown>) => void } | null>(null);

  const quickSelect = useMemo(
    () => niches.find((n) => n.name === niche)?.problems ?? [],
    [niches, niche],
  );

  // The non-blocking nudge (§19.3). It never prevents a save — a rep at a loud
  // venue who does not have an email must still be able to record the lead.
  const noChannel = hasNoFollowUpChannel({
    linkedin_url: linkedin.trim() || null,
    prospect_email: email.trim() || null,
  });

  function toggleProblem(problem: string) {
    setProblems((current) =>
      current.includes(problem) ? current.filter((p) => p !== problem) : [...current, problem],
    );
  }

  async function save() {
    setSaving(true);
    setError(null);

    try {
      await apiSend(`/api/sessions/${session.id}`, 'PATCH', {
        prospect_name: name,
        prospect_company: company,
        prospect_website: website,
        prospect_email: email,
        prospect_phone: phone,
        linkedin_url: linkedin,
        niche,
        problems,
        custom_problems: customProblems,
        memorable_info: memorable,
      });

      clearDraft();
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    setError(null);
    try {
      await apiSend(`/api/sessions/${session.id}/re-enrich`, 'POST');
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not regenerate the page.');
    }
  }

  async function voidSession() {
    if (
      !confirm(
        'Void this card and session?\n\nThe card cannot be reused — it may already be in ' +
          'someone’s pocket. Use a fresh card instead.',
      )
    ) {
      return;
    }

    try {
      await apiSend(`/api/sessions/${session.id}/void`, 'POST');
      router.push('/dashboard');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not void the session.');
    }
  }

  async function deleteSession() {
    if (
      !confirm(
        'Delete this lead completely?\n\nTheir details, page, messages and any booking are ' +
          'removed for good. Use this when someone asks to be forgotten. The card stops working.',
      )
    ) {
      return;
    }

    try {
      await apiSend(`/api/sessions/${session.id}`, 'DELETE');
      router.push('/dashboard');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the lead.');
    }
  }

  async function undoRegistration() {
    try {
      await apiSend(`/api/sessions/${session.id}/release`, 'POST', {});
      router.push('/dashboard');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not put the card back.');
    }
  }

  const hex = COLOUR_HEX[session.colour_tag as ColourTag] ?? '#6F685F';

  return (
    <div className="pb-4">
      <header className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="h-4 w-4 rounded-full ring-2 ring-white"
          style={{ backgroundColor: hex }}
        />
        <h1 className="font-display text-ink text-2xl font-bold tracking-tight">
          Card {session.event_sequence_number} — {session.colour_tag}
        </h1>
      </header>

      <p className="text-ink-3 mt-1 font-mono text-[12px] tracking-wide">{printedCode(cardCode)}</p>
      <p className="text-ink-3 mt-1 text-[13px]">
        {eventName ? `${eventName} · ` : ''}
        {session.registered_by === 'prospect_tap'
          ? 'opened by them before you registered it'
          : `registered by ${session.registered_by}`}
      </p>
      <EventPicker sessionId={session.id} eventId={session.event_id} events={events} />

      {justRegistered ? (
        <p className="bg-ok-bg text-ok mt-4 rounded-lg px-3 py-2.5 text-sm font-medium">
          Registered. Hand the card over — you can fill this in once you have stepped away.
        </p>
      ) : null}

      {restored ? (
        <p className="bg-warn-bg text-warn mt-4 rounded-lg px-3 py-2.5 text-sm font-medium">
          Restored your unsaved draft.
        </p>
      ) : null}

      {justRegistered && !session.details_completed_at && !session.first_viewed_at ? (
        <button
          type="button"
          onClick={() => void undoRegistration()}
          className="text-ink-3 hover:text-ink-2 mt-2 text-[13px] underline underline-offset-2"
        >
          Tapped by mistake? Put this card back
        </button>
      ) : null}

      <QuickNote
        niches={niches}
        scanEnabled={scanEnabled}
        onScan={(card: CardFields) => {
          // Fill only what is still empty NOW (not what was empty when the photo was taken).
          const now = latest.current;
          const fullName = now.name.trim() || card.name || '';
          const companyName = now.company.trim() || card.company || '';
          const fillIfEmpty = (value: string | null) => (current: string) =>
            current.trim() ? current : (value ?? current);
          if (card.name) setName(fillIfEmpty(card.name));
          if (card.company) setCompany(fillIfEmpty(card.company));
          if (card.email) setEmail(fillIfEmpty(card.email));
          if (card.phone) setPhone(fillIfEmpty(card.phone));
          if (card.website) setWebsite(fillIfEmpty(card.website));
          // The scan starts the lookups: the rep only taps the right answers below.
          if (lookupEnabled) {
            if (!card.website && !now.website.trim() && companyName.length >= 2) {
              siteLookup.current?.run({ name: companyName });
            }
            if (fullName.split(/\s+/).length >= 2) {
              profileLookup.current?.run({ name: fullName, company: companyName || undefined });
            }
          }
        }}
        onFill={(fill) => {
          const fillIfEmpty = (value: string) => (current: string) =>
            current.trim() ? current : value;
          if (fill.name) setName(fillIfEmpty(fill.name));
          if (fill.company) setCompany(fillIfEmpty(fill.company));
          // Never swap a niche the rep already worked in.
          if (fill.niche && latest.current.problemCount === 0) setNiche(fill.niche);
          if (fill.problems.length > 0) {
            setProblems((current) => [...new Set([...current, ...fill.problems])]);
          }
          if (fill.extra) setCustomProblems(fillIfEmpty(fill.extra));
        }}
      />

      <div className="mt-6 flex flex-col gap-4">
        <Field label="Their name" htmlFor="name">
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>

        <Field label="Company" htmlFor="company">
          <Input
            id="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>

        <Field
          label="Their website"
          htmlFor="website"
          hint="Optional. Makes sure we research the right company — worth it for a gmail address or a common name."
        >
          <Input
            id="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="abcservices.co.uk"
            inputMode="url"
            autoCapitalize="none"
            autoComplete="off"
          />
          {lookupEnabled ? (
            <LookupPicker
              buttonLabel="Find their website"
              disabled={company.trim().length < 2}
              path="/api/lookup/company"
              body={() => ({ name: company.trim() })}
              toItems={(response: SiteLookup) =>
                response.candidates.map((c) => ({
                  key: c.url,
                  primary: c.domain,
                  secondary: c.title,
                  badge: c.url === response.likelyUrl ? 'Likely' : undefined,
                  likely: c.url === response.likelyUrl,
                  value: c.domain,
                }))
              }
              onPick={setWebsite}
              onReady={setSiteApi}
              emptyText="Nothing found. Type the website if you know it."
            />
          ) : null}
        </Field>

        {niches.length > 0 ? (
          <Field label="Niche" htmlFor="niche">
            <select
              id="niche"
              value={niche}
              onChange={(e) => {
                setNiche(e.target.value);
                // Problems belong to a niche, so switching niche clears any
                // selections that no longer have a home.
                setProblems([]);
              }}
              className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/20 h-12 w-full rounded-lg border px-3 text-base focus:ring-2 focus:outline-none"
            >
              {niches.map((n) => (
                <option key={n.name} value={n.name}>
                  {n.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {quickSelect.length > 0 ? (
          <fieldset>
            <legend className="text-ink-2 text-sm font-medium">What did they raise?</legend>
            <p className="text-ink-3 mt-0.5 text-[13px] leading-snug">
              Tap everything that came up. This is what the page is written around.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {quickSelect.map((problem) => {
                const selected = problems.includes(problem);
                return (
                  <button
                    key={problem}
                    type="button"
                    onClick={() => toggleProblem(problem)}
                    aria-pressed={selected}
                    className={`rounded-full border px-3 py-2 text-left text-[13px] font-medium ${
                      selected
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-line bg-surface text-ink-2'
                    }`}
                  >
                    {problem}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <Field
          label="Anything else they said"
          hint="Their own words, if you can remember them."
          htmlFor="custom"
        >
          <Textarea
            id="custom"
            rows={3}
            value={customProblems}
            onChange={(e) => setCustomProblems(e.target.value)}
          />
        </Field>

        <Field
          label="To remember them by"
          // §23.1 — the sharp edge. A rep typing quickly at a networking event
          // will not be drawing the special-category line, so the form does.
          hint="Only for you. Never shown to them and never seen by the AI. Business-relevant details only: no health, religion, politics or personal circumstances."
          htmlFor="memorable"
        >
          <Textarea
            id="memorable"
            rows={2}
            value={memorable}
            onChange={(e) => setMemorable(e.target.value)}
            maxLength={500}
          />
        </Field>

        <div className="border-line-soft border-t pt-4">
          <h2 className="text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase">
            How to reach them
          </h2>

          <div className="mt-3 flex flex-col gap-4">
            <Field
              label="LinkedIn"
              hint="Best: paste the link. Ask to scan their LinkedIn QR code (search bar, QR icon) or copy it from the app. The search below is a helper and often wrong."
              htmlFor="linkedin"
            >
              <Input
                id="linkedin"
                type="url"
                inputMode="url"
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
                placeholder="https://linkedin.com/in/…"
              />
              {lookupEnabled ? (
                <LookupPicker
                  buttonLabel="Search the web for LinkedIn"
                  disabled={name.trim().split(/\s+/).length < 2}
                  path="/api/lookup/linkedin"
                  body={() => ({ name: name.trim(), company: company.trim() || undefined })}
                  toItems={(response: ProfileLookup) =>
                    response.candidates.map((c) => ({
                      key: c.url,
                      checkUrl: c.url,
                      primary: c.headline.replace(/\s*\|\s*LinkedIn.*$/i, ''),
                      secondary: c.snippet || undefined,
                      badge:
                        c.url === response.likelyUrl
                          ? 'Likely'
                          : c.label === 'exact_match'
                            ? 'Check'
                            : c.label === 'ambiguous'
                              ? 'Unsure'
                              : c.label === 'namesake'
                                ? 'Other company'
                                : undefined,
                      likely: c.url === response.likelyUrl,
                      value: c.url,
                    }))
                  }
                  onPick={setLinkedin}
                  onReady={setProfileApi}
                  emptyText="No profile found. Paste the link if they shared it."
                />
              ) : null}
            </Field>

            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            <Field label="Phone" htmlFor="phone">
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
          </div>

          {noChannel ? (
            <p className="bg-warn-bg text-warn mt-3 rounded-lg px-3 py-2.5 text-[13px] font-medium">
              No way to follow up if they don&rsquo;t tap. Add LinkedIn or email?
            </p>
          ) : null}
        </div>

        {error ? (
          <p
            className="bg-crit-bg text-crit rounded-lg px-3 py-2.5 text-sm font-medium"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {saved && !error ? (
          <p className="bg-ok-bg text-ok rounded-lg px-3 py-2.5 text-sm font-medium" role="status">
            Saved. We&rsquo;re putting their page together now.
          </p>
        ) : null}

        {saved && !error ? (
          <Link
            href="/dashboard"
            className="border-line bg-surface text-ink hover:border-ink-3 flex h-12 items-center justify-center rounded-lg border text-[15px] font-medium"
          >
            Next card
          </Link>
        ) : null}

        <Button size="block" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save details'}
        </Button>

        {session.details_completed_at ? (
          <EnrichmentStatus status={session.enrichment_status} onRegenerate={regenerate} />
        ) : null}

        {session.rep_pitch ? (
          <p className="text-ink-3 text-[13px]">
            You edited their pitch, so saving or regenerating keeps your version. Switch back to
            INSIGNAR&rsquo;s on the preview.
          </p>
        ) : null}

        <Link
          href={`/sessions/${session.id}/preview`}
          className="border-line bg-surface text-ink hover:bg-surface-2 flex h-12 items-center justify-center rounded-lg border text-[15px] font-medium"
        >
          Preview their page
        </Link>

        <button
          type="button"
          onClick={voidSession}
          className="text-crit mt-2 self-center text-[13px] underline underline-offset-2"
        >
          Wrong card — void this session
        </button>

        <button
          type="button"
          onClick={deleteSession}
          className="text-ink-3 hover:text-crit self-center text-[13px] underline underline-offset-2"
        >
          Delete this lead completely
        </button>
      </div>
    </div>
  );
}

/**
 * What the prospect will see right now, in the rep's terms, and a way to try
 * again (§15.2 re-enrich). A `failed` session is not an emergency — the prospect
 * gets the template pitch and cannot tell — so this informs rather than alarms.
 */
function EnrichmentStatus({ status, onRegenerate }: { status: string; onRegenerate: () => void }) {
  const label =
    status === 'completed'
      ? 'Their page is ready.'
      : status === 'failed'
        ? 'Their page is using the standard note — the tailored one could not be written.'
        : 'Their page is being put together.';

  return (
    <div className="border-line-soft text-ink-2 flex items-center justify-between gap-3 border-t pt-3 text-[13px]">
      <span>{label}</span>
      {status === 'completed' || status === 'failed' ? (
        <button
          type="button"
          onClick={onRegenerate}
          className="text-accent shrink-0 font-medium underline underline-offset-2"
        >
          Regenerate
        </button>
      ) : null}
    </div>
  );
}

/** File this lead under a different event. Hidden when there is only one to pick. */
function EventPicker({
  sessionId,
  eventId,
  events,
}: {
  sessionId: string;
  eventId: string;
  events: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (events.length < 2) return null;

  async function change(next: string) {
    if (next === eventId) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/sessions/${sessionId}/event`, 'POST', { event_id: next });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not move this lead.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <label htmlFor="event-picker" className="text-ink-3 text-[12px]">
        Filed under
      </label>
      <select
        id="event-picker"
        value={eventId}
        disabled={busy}
        onChange={(e) => void change(e.target.value)}
        className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/20 mt-1 h-11 w-full rounded-lg border px-3 text-base focus:ring-2 focus:outline-none"
      >
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.name}
          </option>
        ))}
      </select>
      {error ? <p className="text-crit mt-1 text-[13px]">{error}</p> : null}
    </div>
  );
}

/**
 * "Say it or type it": one line, then the form fills itself for you to check. The
 * phone's own keyboard microphone does the dictating, so no audio ever reaches us.
 */
function QuickNote({
  niches,
  scanEnabled,
  onScan,
  onFill,
}: {
  niches: { name: string; problems: string[] }[];
  scanEnabled: boolean;
  onScan: (card: CardFields) => void;
  onFill: (fill: NoteFill) => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const fill = await apiSend<NoteFill>('/api/capture/note', 'POST', { line, niches });
      const parts = [
        fill.name ? 'name' : null,
        fill.company ? 'company' : null,
        fill.problems.length > 0
          ? `${fill.problems.length} problem${fill.problems.length === 1 ? '' : 's'}`
          : null,
      ].filter(Boolean);
      onFill(fill);
      setMessage(
        parts.length > 0
          ? `Filled in ${parts.join(', ')}. Check it below, then save.`
          : 'Nothing to fill in from that line.',
      );
      setLine('');
    } catch {
      setMessage('Could not read that. Fill the form below instead.');
    } finally {
      setBusy(false);
    }
  }

  async function scan(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setScanning(true);
    setMessage(null);
    try {
      const blob = await shrinkToJpeg(file, 1400);
      const card = await apiUpload<CardFields>('/api/capture/card', blob);
      const found = [card.name, card.company, card.email, card.phone, card.website].filter(
        Boolean,
      ).length;
      onScan(card);
      setMessage(
        found > 0
          ? 'Read their card. Tap any field below to correct it, and tap the right website and LinkedIn when they appear.'
          : 'Could not read that card. Try again in better light, or type it.',
      );
    } catch {
      setMessage('Could not read that card. Fill the form below instead.');
    } finally {
      setScanning(false);
    }
  }

  return (
    <section className="border-line bg-surface mt-6 rounded-xl border p-4">
      <label htmlFor="quick-note" className="text-ink text-[15px] font-semibold">
        Say it or type it
      </label>
      <p className="text-ink-3 mt-0.5 text-[13px] leading-snug">
        One line is enough. Tap the microphone on your keyboard to dictate.
      </p>
      <Textarea
        id="quick-note"
        rows={2}
        value={line}
        onChange={(e) => setLine(e.target.value)}
        placeholder="Sarah Whitlock, Whitlock Homes, stuck waiting on funding"
        maxLength={600}
        className="mt-2"
      />
      <button
        type="button"
        disabled={busy || line.trim().length < 3}
        onClick={() => void run()}
        className="bg-accent hover:bg-accent-hover mt-2 h-11 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Reading…' : 'Fill the form'}
      </button>
      {scanEnabled ? (
        <>
          <button
            type="button"
            disabled={scanning}
            onClick={() => camera.current?.click()}
            className="border-line bg-surface text-ink hover:border-ink-3 mt-2 ml-2 h-11 rounded-lg border px-4 text-sm font-medium disabled:opacity-50"
          >
            {scanning ? 'Reading card…' : 'Scan their card'}
          </button>
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            onChange={scan}
          />
        </>
      ) : null}
      {message ? (
        <p className="text-ink-2 mt-2 text-[13px]" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
