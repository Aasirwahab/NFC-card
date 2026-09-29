'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { PhotoUpload } from './photo-upload';
import {
  saveBusinessAction,
  saveKnowledgeAction,
  saveProfileAction,
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
