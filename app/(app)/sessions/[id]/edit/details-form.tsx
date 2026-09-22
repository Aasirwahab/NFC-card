'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { COLOUR_HEX, type ColourTag } from '@/lib/domain/colours';
import type { Niche } from '@/lib/db/rep';
import type { Row } from '@/lib/db/types';
import { apiSend } from '@/lib/http/client';
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
  justRegistered,
}: {
  session: Session;
  niches: Niche[];
  eventName: string | null;
  justRegistered: boolean;
}) {
  const router = useRouter();

  const [name, setName] = useState(session.prospect_name ?? '');
  const [company, setCompany] = useState(session.prospect_company ?? '');
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
        prospect_email: email,
        prospect_phone: phone,
        linkedin_url: linkedin,
        niche,
        problems,
        custom_problems: customProblems,
        memorable_info: memorable,
      });

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

  const hex = COLOUR_HEX[session.colour_tag as ColourTag] ?? '#6B7977';

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

      <p className="text-ink-3 mt-1 text-[13px]">
        {eventName ? `${eventName} · ` : ''}registered by {session.registered_by}
      </p>

      {justRegistered ? (
        <p className="bg-ok-bg text-ok mt-4 rounded-lg px-3 py-2.5 text-sm font-medium">
          Registered. Hand the card over — you can fill this in once you have stepped away.
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-4">
        <Field label="Their name" htmlFor="name">
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </Field>

        <Field label="Company" htmlFor="company">
          <Input
            id="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            autoComplete="off"
          />
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
          hint="Business-relevant details only — no health, religion, politics or personal circumstances. Never shown to them."
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
              hint="Paste the URL if they shared it. There is no automatic lookup."
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

        <Button size="block" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save details'}
        </Button>

        {session.details_completed_at ? (
          <EnrichmentStatus status={session.enrichment_status} onRegenerate={regenerate} />
        ) : null}

        {session.rep_pitch ? (
          <p className="text-ink-3 text-[13px]">
            You edited their pitch, so saving or regenerating keeps your version. Switch back to
            TapLead&rsquo;s on the preview.
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
