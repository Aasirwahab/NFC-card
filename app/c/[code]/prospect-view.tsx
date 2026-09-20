import Link from 'next/link';
import type { Resolved } from '@/lib/db/landing';
import { callToAction, greeting, templatePitch } from '@/lib/domain/pitch';
import { Crafting } from './crafting';

/**
 * The prospect landing page (spec §16). THIS IS THE PRODUCT — everything else
 * exists to make this page good.
 *
 * Non-negotiables, all enforced below:
 *   - Never show a raw error. Any unhandled exception renders the generic page.
 *   - Never echo the memorable note. It is not even loaded from the database.
 *   - Never announce the AI. No "AI-generated" label, no robot iconography.
 *   - Visible How it works and Privacy links, both real pages.
 *   - Problem-specific CTA, derived from the selected problem.
 *   - Cached, never generated on tap. The tap is a read.
 *   - Mobile only. It is being viewed on a phone.
 */

type ProspectResolved = Extract<Resolved, { audience: 'prospect' }>;

export function ProspectView({ resolved }: { resolved: ProspectResolved }) {
  const { session, rep, business, eventName, view, code } = resolved;

  const pitchInput = {
    prospectName: session.prospect_name,
    prospectCompany: session.prospect_company,
    problems: session.problems,
    customProblems: session.custom_problems,
    repName: firstName(rep.fullName),
    businessName: business?.companyName ?? null,
    services: business?.services ?? [],
    eventName,
  };

  const fallbackPitch = templatePitch(pitchInput);
  const cta = callToAction({
    problems: session.problems,
    customProblems: session.custom_problems,
    repName: firstName(rep.fullName),
  });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[34rem] flex-col px-5 pb-10">
      <Header rep={rep} business={business} />

      <main className="flex-1">
        <p className="font-display text-ink mt-7 text-2xl font-semibold tracking-tight">
          {greeting(session.prospect_name)}
        </p>

        {view.state === 'completed' ? (
          <Pitch text={view.pitch} />
        ) : view.state === 'crafting' ? (
          <Crafting code={code} fallbackPitch={fallbackPitch} />
        ) : view.state === 'failed' ? (
          <Pitch text={fallbackPitch} />
        ) : (
          <PendingBody
            eventName={eventName}
            business={business}
            repName={firstName(rep.fullName)}
          />
        )}

        {business && business.services.length > 0 && view.state !== 'crafting' ? (
          <SolutionPoints services={business.services} companyName={business.companyName} />
        ) : null}

        <CallToActionBlock label={cta} repName={firstName(rep.fullName)} />
      </main>

      <Footer />
    </div>
  );
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function Header({
  rep,
  business,
}: {
  rep: ProspectResolved['rep'];
  business: ProspectResolved['business'];
}) {
  return (
    <header className="border-line-soft flex items-center gap-3.5 border-b pt-8 pb-5">
      {rep.photoUrl ? (
        /*
         * A plain <img> on purpose. photo_url is an arbitrary URL the rep typed,
         * so next/image would reject any host not in remotePatterns and the rep
         * would silently lose their face on the one page that must not look
         * broken. Revisit when photos move to Supabase Storage on a known host.
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={rep.photoUrl}
          alt=""
          width={56}
          height={56}
          className="border-line h-14 w-14 shrink-0 rounded-full border object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="bg-accent-soft text-accent font-display flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold"
        >
          {initials(rep.fullName)}
        </div>
      )}

      <div className="min-w-0">
        <p className="font-display text-ink truncate text-[17px] font-semibold tracking-tight">
          {rep.fullName}
        </p>
        <p className="text-ink-2 truncate text-sm">
          {[rep.title, business?.companyName].filter(Boolean).join(' · ')}
        </p>
      </div>
    </header>
  );
}

function Pitch({ text }: { text: string }) {
  return (
    <div className="text-ink-2 mt-3 space-y-3.5 text-[17px] leading-relaxed">
      {text
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
    </div>
  );
}

/**
 * The `pending` state: the rep registered the card but never filled in the
 * details. Warm and generic — honest, still useful, better than a blank page.
 */
function PendingBody({
  eventName,
  business,
  repName,
}: {
  eventName: string | null;
  business: ProspectResolved['business'];
  repName: string;
}) {
  return (
    <div className="text-ink-2 mt-3 space-y-3.5 text-[17px] leading-relaxed">
      <p>{eventName ? `Great to meet you at ${eventName}.` : 'Great to meet you the other day.'}</p>
      {business?.tagline ? <p>{business.tagline}</p> : null}
      <p>
        If you want to pick up where we left off, grab a slot below and {repName} will come
        prepared.
      </p>
    </div>
  );
}

function SolutionPoints({ services, companyName }: { services: string[]; companyName: string }) {
  const points = services
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (points.length === 0) return null;

  return (
    <section className="mt-7">
      <h2 className="text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase">
        What {companyName} does
      </h2>
      <ul className="mt-2.5 space-y-2">
        {points.map((point) => (
          <li key={point} className="text-ink-2 flex gap-2.5 text-[15px] leading-snug">
            <span
              aria-hidden="true"
              className="bg-accent mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full"
            />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The CTA (§16, §5.5). Problem-specific text, never "Book a demo".
 *
 * The booking embed and the chat widget arrive in Phase 5. Until then this block
 * carries the CTA label and nothing that pretends to work — a dead button on the
 * one page that gets one chance would be worse than no button.
 */
function CallToActionBlock({ label, repName }: { label: string; repName: string }) {
  return (
    <section className="border-accent-soft bg-surface shadow-card mt-8 rounded-xl border p-5">
      <p className="font-display text-ink text-[17px] leading-snug font-semibold tracking-tight">
        {label}
      </p>
      <p className="text-ink-2 mt-1.5 text-sm">
        {repName} will come prepared — no pitch deck, no discovery call before the discovery call.
      </p>
      {/* TODO(phase 5): Cal.com embed with metadata.session_id prefilled (§19.1),
          the chat widget (§18), and email capture (§19.2) mount here. */}
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-line-soft text-ink-3 mt-10 border-t pt-5 text-[13px]">
      {/* This is what defuses the "what is this?" reaction (§16). Both are real pages. */}
      <div className="flex gap-4">
        <Link href="/how-it-works" className="hover:text-ink-2 underline underline-offset-2">
          How it works
        </Link>
        <Link href="/privacy" className="hover:text-ink-2 underline underline-offset-2">
          Privacy
        </Link>
      </div>
    </footer>
  );
}
