import Link from 'next/link';
import styles from '@/app/ui-slice.module.css';
import { UserPlus } from 'lucide-react';
import type { Resolved } from '@/lib/db/landing';
import { parseBookingUrl } from '@/lib/booking/link';
import { openingLine } from '@/lib/chat/assistant';
import {
  midSentence,
  primaryProblem,
  publicEventName,
  relevantServices,
  templatePitch,
} from '@/lib/domain/pitch';
import { emailConfigured } from '@/lib/email/mailer';
import { env } from '@/lib/env';
import { Booking } from './booking';
import { StickyAction } from './sticky-action';
import { ProspectShell } from './prospect-shell';
import { ChatWidget } from './chat-widget';
import { EmailMe } from './email-me';
import { linkedinHref } from '@/lib/domain/linkedin';
import { LinkedInConnect } from './linkedin-connect';
import { RemoveDetails } from './remove-details';
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

export function ProspectView({
  resolved,
  preview = false,
}: {
  resolved: ProspectResolved;
  /** The rep's own preview (§14.5): the page as-is, but nothing that spends the prospect's questions. */
  preview?: boolean;
}) {
  const { session, rep, business, eventName, view, code, playbook } = resolved;

  const pitchInput = {
    prospectName: session.prospect_name,
    prospectCompany: session.prospect_company,
    problems: session.problems,
    customProblems: session.custom_problems,
    repName: firstName(rep.fullName),
    businessName: business?.companyName ?? null,
    services: business?.services ?? [],
    eventName,
    hasBooking: Boolean(parseBookingUrl(rep.bookingUrl)),
  };

  const fallbackPitch = templatePitch(pitchInput);
  // No link, no button: a dead button on this page is worse than none (§16).
  const bookingLink = parseBookingUrl(rep.bookingUrl);
  const linkedin = linkedinHref(rep.linkedinUrl);
  const publicEvent = publicEventName(eventName);
  const prospectFirst = session.prospect_name?.trim() ? firstName(session.prospect_name) : null;
  const topics = session.problems.filter((problem) => problem.trim());
  const customTopic = session.custom_problems?.trim();
  const lead = primaryProblem({
    problems: session.problems,
    customProblems: session.custom_problems,
  });
  const services = relevantServices(business?.services ?? [], [...topics, customTopic ?? '']);

  return (
    // pb-28 keeps the footer links clear of the floating chat button.
    <ProspectShell className={`${styles.surface} ${styles.publicPage} ${styles.prospectPage}`}>
      <Header rep={rep} business={business}>
        {bookingLink ? <SaveContact code={code} repName={firstName(rep.fullName)} compact /> : null}
      </Header>

      <main className="flex-1">
        <h1 className={prospectFirst ? styles.preparedFor : styles.headline}>
          {prospectFirst ? `Prepared for ${prospectFirst}` : 'Picking up our conversation.'}
        </h1>
        {publicEvent ? (
          <h2 className={styles.headline}>From our conversation at {publicEvent}</h2>
        ) : prospectFirst ? (
          <h2 className={styles.headline}>From our conversation</h2>
        ) : null}

        {topics.length > 0 || customTopic ? (
          <section className={styles.issuePanel} aria-labelledby="discussed-issue">
            <h2 id="discussed-issue" className={styles.sectionLabel}>
              The issue we discussed
            </h2>
            {topics.map((topic, index) => (
              <p key={index} className={styles.issueTopic}>
                {topic}
              </p>
            ))}
            {customTopic ? <p className={styles.issueTopic}>{customTopic}</p> : null}
            {session.prospect_company ? (
              <p className={styles.issueCompany}>{session.prospect_company}</p>
            ) : null}
          </section>
        ) : null}

        <section className={styles.pitchSection}>
          <h2 className={styles.sectionLabel}>{firstName(rep.fullName)}&rsquo;s read on it</h2>
          {view.state === 'completed' ? (
            <Pitch text={view.pitch} />
          ) : view.state === 'crafting' ? (
            <Crafting code={code} fallbackPitch={fallbackPitch} />
          ) : view.state === 'failed' ? (
            <Pitch text={fallbackPitch} />
          ) : (
            <PendingBody
              eventName={publicEvent}
              business={business}
              repName={firstName(rep.fullName)}
              hasBooking={Boolean(bookingLink)}
            />
          )}
        </section>

        <CallToActionBlock
          label={
            lead
              ? bookingLink
                ? `Pick a time to talk about ${midSentence(lead)}.`
                : `Keep ${firstName(rep.fullName)}’s details to talk about ${midSentence(lead)}.`
              : 'Pick up where we left off.'
          }
          note={
            bookingLink
              ? `${firstName(rep.fullName)} will come prepared.`
              : 'Save the contact, then message or call when it suits you.'
          }
        >
          {bookingLink ? (
            <Booking
              code={code}
              sessionId={session.id}
              prospectName={session.prospect_name}
              link={bookingLink}
              preview={preview}
            />
          ) : (
            <StickyAction enabled={!preview}>
              <SaveContact code={code} repName={firstName(rep.fullName)} primary />
            </StickyAction>
          )}
          {linkedin ? (
            <LinkedInConnect
              code={code}
              href={linkedin}
              repName={firstName(rep.fullName)}
              preview={Boolean(preview)}
            />
          ) : null}
        </CallToActionBlock>

        {playbook && view.state !== 'pending' ? <PlaybookBlock playbook={playbook} /> : null}

        {business && services.length > 0 && view.state !== 'crafting' ? (
          <SolutionPoints services={services} companyName={business.companyName} />
        ) : null}

        <div className={styles.chatRegion}>
          <ChatWidget
            code={code}
            repFirstName={firstName(rep.fullName)}
            opening={openingLine(
              firstName(rep.fullName),
              primaryProblem({
                problems: session.problems,
                customProblems: session.custom_problems,
              }),
            )}
            enabled={env.CHAT_ENABLED}
            preview={preview}
          />
        </div>
      </main>

      <Footer removeCode={preview ? undefined : code}>
        {emailConfigured() && !preview ? (
          <EmailMe code={code} repFirstName={firstName(rep.fullName)} />
        ) : null}
      </Footer>
    </ProspectShell>
  );
}

/**
 * What the rep wrote about this problem, shown as they wrote it: why it usually
 * happens, up to three things worth checking, and an optional link. Nothing here is
 * generated, so nothing here can be invented. It is the "something for you" in the note.
 */
function PlaybookBlock({ playbook }: { playbook: NonNullable<ProspectResolved['playbook']> }) {
  return (
    <section className={styles.playbook}>
      {playbook.why ? (
        <>
          <h2 className="text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase">
            Why this usually happens
          </h2>
          <p className="text-ink-2 mt-1.5 text-[16px] leading-relaxed">{playbook.why}</p>
        </>
      ) : null}
      {playbook.checks.length > 0 ? (
        <>
          <h2
            className={`text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase ${
              playbook.why ? 'mt-5' : ''
            }`}
          >
            Worth checking this week
          </h2>
          <ol className={styles.stepper}>
            {playbook.checks.map((check, index) => (
              <li key={check}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>{check}</span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {playbook.resourceUrl ? (
        <a
          href={playbook.resourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent mt-5 inline-block text-[15px] font-medium underline underline-offset-2"
        >
          A useful read
        </a>
      ) : null}
    </section>
  );
}

/** "Director · Acme", but not "Director, Acme · Acme" when the title already names it. */
function titleLine(title: string | null, company: string | null): string {
  const t = title?.trim() || null;
  const c = company?.trim() || null;
  if (t && c && t.toLowerCase().includes(c.toLowerCase())) return t;
  return [t, c].filter(Boolean).join(' · ');
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

export function Header({
  rep,
  business,
  children,
}: {
  children?: React.ReactNode;
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
          {titleLine(rep.title, business?.companyName ?? null)}
        </p>
      </div>
      {children}
    </header>
  );
}

function Pitch({ text }: { text: string }) {
  return (
    <div className={styles.pitch}>
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
  hasBooking,
}: {
  eventName: string | null;
  business: ProspectResolved['business'];
  repName: string;
  hasBooking: boolean;
}) {
  return (
    <div className={styles.pitch}>
      <p>{eventName ? `Great to meet you at ${eventName}.` : 'Great to meet you the other day.'}</p>
      {business?.tagline ? <p>{business.tagline}</p> : null}
      <p>
        {hasBooking
          ? `If you want to pick up where we left off, grab a slot below and ${repName} will come prepared.`
          : `If you want to pick up where we left off, save ${repName}’s contact below and get in touch.`}
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
    <section className={styles.services}>
      <h2 className="text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase">
        What {companyName} does
      </h2>
      <ul className="mt-1.5">
        {points.map((point) => (
          <li key={point} className={styles.service}>
            <span aria-hidden="true" className={styles.serviceDot} />
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
 * Carries the rep's booking calendar when they have set a Cal.com link, and
 * nothing that pretends to work when they have not — a dead button on the one
 * page that gets one chance would be worse than no button.
 */
function CallToActionBlock({
  label,
  note,
  children,
}: {
  label: string;
  note: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={styles.cta}>
      <p className="font-display text-ink text-[17px] leading-snug font-semibold tracking-tight">
        {label}
      </p>
      <p className="text-ink-2 mt-1.5 text-sm">{note}</p>
      {children}
    </section>
  );
}

/**
 * "Save the rep's contact" (Phase 5). A plain link to a vCard, which both iOS
 * and Android open straight into "Add contact". It is a real, working button —
 * the rule for this page is that nothing on it pretends to work.
 */
export function SaveContact({
  code,
  repName,
  compact = false,
  primary = false,
}: {
  code: string;
  repName: string;
  compact?: boolean;
  primary?: boolean;
}) {
  return (
    <a
      href={`/c/${code}/contact`}
      className={primary ? styles.primaryAction : compact ? styles.compactSave : styles.saveContact}
    >
      <UserPlus className="h-4 w-4" aria-hidden="true" />
      {compact ? 'Save contact' : <>Save {repName}&rsquo;s contact</>}
    </a>
  );
}

export function Footer({
  removeCode,
  children,
}: {
  removeCode?: string;
  children?: React.ReactNode;
}) {
  return (
    <footer className={styles.footer}>
      {children}
      {/*
       * The acquisition loop (2026-09-25 review): whoever is holding this card
       * goes to events and hands out cards — exactly who INSIGNAR is for.
       */}
      <Link
        href="/?ref=card"
        className="text-ink-2 [@media(hover:hover)_and_(pointer:fine)]:hover:text-ink mb-4 inline-block font-medium underline underline-offset-2"
      >
        Get your own INSIGNAR card
      </Link>
      {/* This is what defuses the "what is this?" reaction (§16). Both are real pages. */}
      <div className="flex gap-4">
        <Link
          href="/how-it-works"
          className="[@media(hover:hover)_and_(pointer:fine)]:hover:text-ink-2 underline underline-offset-2"
        >
          How it works
        </Link>
        <Link
          href="/privacy"
          className="[@media(hover:hover)_and_(pointer:fine)]:hover:text-ink-2 underline underline-offset-2"
        >
          Privacy
        </Link>
      </div>
      {removeCode ? <RemoveDetails code={removeCode} /> : null}
    </footer>
  );
}
