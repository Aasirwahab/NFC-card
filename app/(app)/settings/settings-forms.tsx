'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { apiSend } from '@/lib/http/client';
import { Field, Input, Textarea } from '@/components/ui/field';
import { PhotoUpload } from './photo-upload';
import {
  saveBusinessAction,
  deletePlaybookAction,
  saveKnowledgeAction,
  savePlaybookAction,
  saveProfileAction,
  savePitchVoiceAction,
  type SettingsState,
} from './actions';

function SaveButton({ label = 'Save' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="self-start">
      {pending ? 'Saving…' : label}
    </Button>
  );
}

function Status({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p className="bg-crit-bg text-crit rounded-lg px-3 py-2.5 text-sm font-medium" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return (
      <p className="bg-ok-bg text-ok rounded-lg px-3 py-2.5 text-sm font-medium" role="status">
        Saved.
      </p>
    );
  }
  return null;
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-line bg-surface shadow-card rounded-xl border p-4">
      <h2 className="font-display text-ink font-semibold tracking-tight">{title}</h2>
      {hint ? <p className="text-ink-2 mt-1 text-[13px] leading-snug">{hint}</p> : null}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/**
 * The rep's time zone comes from the phone, so "today" is right wherever they are
 * (which event a first tap belongs to depends on it). Sent with the profile save.
 */
function DeviceTimezone({ current }: { current: string }) {
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (device && field.current) field.current.value = device;
    } catch {
      /* keep the stored zone */
    }
  }, []);
  return <input ref={field} type="hidden" name="timezone" defaultValue={current} />;
}

export function ProfileForm({
  profile,
}: {
  profile: {
    full_name: string;
    title: string | null;
    bio: string | null;
    photo_url: string | null;
    linkedin_url: string | null;
    phone: string | null;
    contact_email: string | null;
    booking_url: string | null;
    language: string;
    timezone: string;
  } | null;
}) {
  const [state, action] = useActionState(saveProfileAction, {});

  return (
    <form action={action}>
      <Panel title="You" hint="This is the face and name on every page your cards open.">
        <Field label="Full name" htmlFor="full_name">
          <Input id="full_name" name="full_name" defaultValue={profile?.full_name ?? ''} required />
        </Field>

        <Field label="Job title" htmlFor="title">
          <Input id="title" name="title" defaultValue={profile?.title ?? ''} />
        </Field>

        <PhotoUpload name={profile?.full_name ?? ''} photoUrl={profile?.photo_url ?? null} />

        <Field label="LinkedIn" htmlFor="linkedin_url">
          <Input
            id="linkedin_url"
            name="linkedin_url"
            type="url"
            defaultValue={profile?.linkedin_url ?? ''}
          />
        </Field>

        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={profile?.phone ?? ''} />
        </Field>

        <Field
          label="Booking link"
          hint="Your Cal.com event. Prospects book straight from their page; leave it blank to hide booking."
          htmlFor="booking_url"
        >
          <Input
            id="booking_url"
            name="booking_url"
            type="url"
            placeholder="https://cal.com/you/15min"
            defaultValue={profile?.booking_url ?? ''}
          />
        </Field>

        <Field
          label="Email for your contact card"
          hint="Shown when a prospect saves your contact from their page. Leave it blank to leave it off."
          htmlFor="contact_email"
        >
          <Input
            id="contact_email"
            name="contact_email"
            type="email"
            autoComplete="email"
            defaultValue={profile?.contact_email ?? ''}
          />
        </Field>

        <Field
          label="Spelling"
          hint="Which English your pitches are written in."
          htmlFor="language"
        >
          <select
            id="language"
            name="language"
            defaultValue={profile?.language ?? 'en-GB'}
            className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/20 h-12 w-full rounded-lg border px-3 text-base focus:ring-2 focus:outline-none"
          >
            <option value="en-GB">British</option>
            <option value="en-US">American</option>
          </select>
        </Field>
        <DeviceTimezone current={profile?.timezone ?? 'UTC'} />

        <Field label="Short bio" htmlFor="bio">
          <Textarea id="bio" name="bio" rows={3} defaultValue={profile?.bio ?? ''} />
        </Field>

        <Status state={state} />
        <SaveButton />
      </Panel>
    </form>
  );
}

const TONES: { value: 'warm' | 'direct' | 'formal'; label: string; hint: string }[] = [
  { value: 'warm', label: 'Warm', hint: 'Friendly and plain, like a good colleague.' },
  { value: 'direct', label: 'Direct', hint: 'Short and to the point.' },
  { value: 'formal', label: 'Formal', hint: 'Measured and professional.' },
];

export function PitchVoiceForm({
  profile,
}: {
  profile: { pitch_tone: string; pitch_hook: string | null; pitch_avoid: string | null } | null;
}) {
  const [state, action] = useActionState(savePitchVoiceAction, {});
  const [tone, setTone] = useState(profile?.pitch_tone ?? 'warm');

  return (
    <form action={action}>
      <Panel
        title="How your notes sound"
        hint="Applies to every prospect note the AI writes for you. You can still ask for a change on any one lead, or write your own."
      >
        <fieldset>
          <legend className="text-ink-2 text-sm font-medium">Tone</legend>
          <input type="hidden" name="pitch_tone" value={tone} />
          <div className="mt-2 flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={tone === t.value}
                onClick={() => setTone(t.value)}
                className={`rounded-full border px-3 py-2 text-left text-[13px] font-medium ${
                  tone === t.value
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-surface text-ink-2'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-ink-3 mt-1.5 text-[13px]">
            {TONES.find((t) => t.value === tone)?.hint}
          </p>
        </fieldset>

        <Field
          label="Your one-line offer"
          htmlFor="pitch_hook"
          hint="In your own words, up to 140 characters. The note may use it once, as written."
        >
          <Input
            id="pitch_hook"
            name="pitch_hook"
            maxLength={140}
            defaultValue={profile?.pitch_hook ?? ''}
            placeholder="We turn missed enquiries into booked calls."
          />
        </Field>

        <Field
          label="Words to never use"
          htmlFor="pitch_avoid"
          hint="Separated by commas. A note that uses one is rewritten."
        >
          <Input
            id="pitch_avoid"
            name="pitch_avoid"
            maxLength={200}
            defaultValue={profile?.pitch_avoid ?? ''}
            placeholder="cheap, jargon, synergy"
          />
        </Field>

        <Status state={state} />
        <SaveButton label="Save voice" />
      </Panel>
    </form>
  );
}

export function BusinessForm({
  business,
}: {
  business: {
    company_name: string;
    tagline: string | null;
    website: string | null;
    services: string[];
  } | null;
}) {
  const [state, action] = useActionState(saveBusinessAction, {});

  return (
    <form action={action}>
      <Panel
        title="Your business"
        hint="What you actually do. The pitch is never allowed to invent anything that is not here."
      >
        <Field label="Company name" htmlFor="company_name">
          <Input
            id="company_name"
            name="company_name"
            defaultValue={business?.company_name ?? ''}
            required
          />
        </Field>

        <Field label="Tagline" htmlFor="tagline">
          <Input id="tagline" name="tagline" defaultValue={business?.tagline ?? ''} />
        </Field>

        <Field label="Website" htmlFor="website">
          <Input id="website" name="website" type="url" defaultValue={business?.website ?? ''} />
        </Field>

        <Field
          label="What you do"
          hint="One per line. The first three show on the prospect's page."
          htmlFor="services"
        >
          <Textarea
            id="services"
            name="services"
            rows={4}
            defaultValue={(business?.services ?? []).join('\n')}
            placeholder={'Plant hire automation\nMaritime compliance reporting'}
          />
        </Field>

        <Status state={state} />
        <SaveButton />
      </Panel>
    </form>
  );
}

const TOPICS = [
  { value: 'services', label: 'Services', hint: 'What you sell, in your own words.' },
  { value: 'pricing', label: 'Pricing', hint: 'Only what you are happy for a chatbot to repeat.' },
  { value: 'faq', label: 'Common questions', hint: 'The five things everyone asks.' },
  { value: 'about', label: 'About', hint: 'Who you are and who you work with.' },
  {
    value: 'niche',
    label: 'Niche knowledge',
    hint: 'The domain detail a generic tool cannot fake.',
  },
] as const;

export function KnowledgeForm({ entries }: { entries: Record<string, string> }) {
  return (
    <Panel
      title="Knowledge base"
      // §6: the spec is explicit that a markdown editor here kills adoption.
      hint="Plain text, no formatting. This is what the chatbot is allowed to answer from — and only this."
    >
      {TOPICS.map((topic) => (
        <KnowledgeTopic
          key={topic.value}
          topic={topic.value}
          label={topic.label}
          hint={topic.hint}
          value={entries[topic.value] ?? ''}
        />
      ))}
    </Panel>
  );
}

function KnowledgeTopic({
  topic,
  label,
  hint,
  value,
}: {
  topic: string;
  label: string;
  hint: string;
  value: string;
}) {
  const [state, action] = useActionState(saveKnowledgeAction, {});

  return (
    <form action={action} className="border-line-soft border-t pt-4 first:border-t-0 first:pt-0">
      <input type="hidden" name="topic" value={topic} />
      <Field label={label} hint={hint} htmlFor={`kb-${topic}`}>
        <Textarea id={`kb-${topic}`} name="content" rows={4} defaultValue={value} />
      </Field>
      <div className="mt-2 flex items-center gap-3">
        <SaveButton />
        <Status state={state} />
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ playbook

export type PlaybookRow = {
  id: string;
  problem: string;
  why: string | null;
  checks: string[];
  resource_url: string | null;
};

/**
 * The rep's playbook: for each problem they hear, why it usually happens, up to three
 * things worth checking, and one link. The prospect reads it as written, so it is the
 * useful part of the note and the AI never adds to it.
 */
export function PlaybookForm({
  entries,
  suggestions,
  draftEnabled,
}: {
  entries: PlaybookRow[];
  /** Problems from the rep's events that have no entry yet. */
  suggestions: string[];
  draftEnabled: boolean;
}) {
  const [starting, setStarting] = useState<string | null>(null);

  return (
    <Panel
      title="Your playbook"
      hint="For each problem you hear: why it usually happens, three things worth checking, and one link. Your prospect reads it exactly as you write it, so keep it true and short."
    >
      {entries.map((entry) => (
        <details
          key={entry.id}
          className="border-line-soft border-t pt-3 first:border-t-0 first:pt-0"
        >
          <summary className="text-ink cursor-pointer text-[15px] font-medium">
            {entry.problem}
          </summary>
          <PlaybookEntry entry={entry} draftEnabled={draftEnabled} />
        </details>
      ))}

      {suggestions.length > 0 ? (
        <div>
          <p className="text-ink-3 text-[13px]">Problems from your events with no entry yet:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.slice(0, 8).map((problem) => (
              <button
                key={problem}
                type="button"
                onClick={() => setStarting(problem)}
                className="border-line bg-surface text-ink-2 hover:bg-surface-2 rounded-full border px-3 py-2 text-left text-[13px] font-medium"
              >
                + {problem}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <details open={starting !== null} className="border-line-soft border-t pt-3">
        <summary className="text-accent cursor-pointer text-[15px] font-medium">
          Add an entry
        </summary>
        <PlaybookEntry
          key={starting ?? 'new'}
          entry={{ id: '', problem: starting ?? '', why: null, checks: [], resource_url: null }}
          draftEnabled={draftEnabled}
        />
      </details>
    </Panel>
  );
}

function PlaybookEntry({ entry, draftEnabled }: { entry: PlaybookRow; draftEnabled: boolean }) {
  const [state, action] = useActionState(savePlaybookAction, {});
  const [problem, setProblem] = useState(entry.problem);
  const [why, setWhy] = useState(entry.why ?? '');
  const [checks, setChecks] = useState<string[]>([
    entry.checks[0] ?? '',
    entry.checks[1] ?? '',
    entry.checks[2] ?? '',
  ]);
  const [drafting, setDrafting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function draft() {
    setDrafting(true);
    setNote(null);
    try {
      const result = await apiSend<{ why: string | null; checks: string[] }>(
        '/api/playbook/draft',
        'POST',
        {
          problem,
        },
      );
      if (!result.why && result.checks.length === 0) {
        setNote('Your notes do not say enough about this yet. Write it in your own words.');
      } else {
        if (result.why) setWhy(result.why);
        setChecks([result.checks[0] ?? '', result.checks[1] ?? '', result.checks[2] ?? '']);
        setNote('A first draft from your own notes. Check every line, then save.');
      }
    } catch {
      setNote('Could not draft that. Write it in your own words.');
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={entry.id} />
        <Field
          label="The problem"
          hint="In the wording you tap at events."
          htmlFor={`pb-problem-${entry.id}`}
        >
          <Input
            id={`pb-problem-${entry.id}`}
            name="problem"
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            required
          />
        </Field>
        {draftEnabled ? (
          <button
            type="button"
            onClick={() => void draft()}
            disabled={drafting || problem.trim().length < 2}
            className="border-line bg-surface text-ink hover:border-ink-3 h-11 self-start rounded-lg border px-3 text-sm font-medium disabled:opacity-50"
          >
            {drafting ? 'Drafting…' : 'Draft it from my notes'}
          </button>
        ) : null}
        {note ? <p className="text-ink-2 text-[13px]">{note}</p> : null}
        <Field
          label="Why it usually happens"
          hint="One plain sentence."
          htmlFor={`pb-why-${entry.id}`}
        >
          <Textarea
            id={`pb-why-${entry.id}`}
            name="why"
            rows={2}
            maxLength={300}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
          />
        </Field>
        {[0, 1, 2].map((i) => (
          <Field key={i} label={`Worth checking ${i + 1}`} htmlFor={`pb-check-${entry.id}-${i}`}>
            <Input
              id={`pb-check-${entry.id}-${i}`}
              name={`check${i + 1}`}
              maxLength={200}
              value={checks[i]}
              onChange={(e) => setChecks((c) => c.map((v, j) => (j === i ? e.target.value : v)))}
            />
          </Field>
        ))}
        <Field
          label="A useful link (optional)"
          hint="A guide, article or case study you would happily send. Must start with https://"
          htmlFor={`pb-link-${entry.id}`}
        >
          <Input
            id={`pb-link-${entry.id}`}
            name="resource_url"
            type="url"
            defaultValue={entry.resource_url ?? ''}
            placeholder="https://"
          />
        </Field>
        <Status state={state} />
        <SaveButton label={entry.id ? 'Save entry' : 'Add entry'} />
      </form>
      {entry.id ? (
        <form action={deletePlaybookAction}>
          <input type="hidden" name="id" value={entry.id} />
          <button type="submit" className="text-crit text-[13px] underline underline-offset-2">
            Delete this entry
          </button>
        </form>
      ) : null}
    </div>
  );
}
