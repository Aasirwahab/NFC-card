import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy notice',
  description: 'What INSIGNAR collects, why, and how to have it deleted.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/privacy' },
};

/**
 * The privacy notice (§23). A real page: what is collected, why, who processes
 * it, how long it is kept, how to object or request deletion.
 *
 * TWO THINGS MUST BE SETTLED BEFORE THIS GOES LIVE (both flagged in the spec):
 *
 *   1. §23 says plainly that this is not legal advice and that the wording should
 *      be checked by someone qualified before the product is sold. The placeholders
 *      below marked TODO are the facts only Zaid can supply.
 *   2. The retention period is an open decision (§28). Twelve months from last
 *      activity is the spec's defensible default and is what is written here; the
 *      Phase 7's purge duration must match the final approved number.
 */

const CONTROLLER = 'INSIGNAR'; // TODO(zaid): registered company name
const CONTACT_EMAIL = 'hello@insignar.com'; // TODO(zaid): confirm this mailbox exists and is monitored
const RETENTION = '12 months from the last activity on your record';

export default function PrivacyPage() {
  return (
    <article className="max-w-xl">
      <h1 className="font-display text-ink text-3xl font-bold tracking-tight">Privacy notice</h1>
      <p className="text-ink-3 mt-2 text-sm">Last updated 13 November 2026</p>

      <p className="text-ink-2 mt-5 text-lg">
        If you tapped one of our cards, this page explains what we hold about you and how to have it
        removed.
      </p>

      <Section title="Who is responsible">
        <p>
          {CONTROLLER} is the data controller for the information described here. You can reach us
          at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="If you request a pilot">
        <p>
          The pilot request form on our home page collects your name, work email, company and,
          optionally, team size. We also note that the request came from our website. We use it only
          to reply to your request and arrange your pilot. We keep it for {RETENTION}, and you can
          ask us to delete it at any time using the address above.
        </p>
      </Section>

      <Section title="What we collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Your name and the company you work for.</li>
          <li>The business problem you described in conversation.</li>
          <li>A short note the person you met wrote to remember the conversation by.</li>
          <li>Your LinkedIn profile or email address, if you shared one.</li>
          <li>Publicly available information about your company, gathered from its website.</li>
          <li>
            A link to your public LinkedIn profile and your company website, if the person you met
            looked them up (see &ldquo;Where it comes from&rdquo;).
          </li>
          <li>
            Whether the card was tapped, and anything you typed into the chat or booking form.
          </li>
          <li>
            If you give them on your page: what matters to you, picked from a short list, and an
            email address or mobile number.
          </li>
        </ul>
        <p>
          We collect this from the conversation you had, not from your device. Tapping the card does
          not transmit anything about you or your phone to us.
        </p>
      </Section>

      <Section title="Where it comes from">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>The conversation.</strong> The person you met typed or dictated what you told
            them. A language model provider reads that one line to suggest which fields to fill in;
            we ask for it not to be kept or used for training. If they spoke the note, our AI
            provider turns it into text and the audio is not kept.
          </li>
          <li>
            <strong>A public web search.</strong> They may have searched the web for your name and
            company to find your public LinkedIn link and company website, and chose which result
            was you. We do not open or copy your LinkedIn page.
          </li>
          <li>
            <strong>Your company&rsquo;s own website</strong>, for facts about what it does.
          </li>
        </ul>
        <p>
          If a lookup picked the wrong person or company, press <strong>Remove my details</strong>{' '}
          or email us and it will be deleted.
        </p>
      </Section>

      <Section title="Why we are allowed to hold it">
        <p>
          Our lawful basis is legitimate interests: following up a business conversation you took
          part in, with business contact information, in a business context. We have carried out a
          balancing assessment and keep it on file. You can object at any time — see below.
        </p>
      </Section>

      <Section title="Who else processes it">
        <p>We use a small number of service providers to run INSIGNAR:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Hosting and application delivery</li>
          <li>Database and authentication</li>
          <li>An AI provider, which generates the message text and turns spoken notes into text</li>
          <li>Transactional email, only when you ask us to send you something</li>
          <li>Calendar booking, only if you book a meeting</li>
        </ul>
        <p>
          {/* §23: the sub-processor list is needed for the notice now and for customer DPAs later. */}
          We keep a current list of these providers and will send it to you on request.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          {RETENTION}, after which it is deleted automatically. Records connected to a booked
          meeting or an ongoing commercial relationship are kept for as long as that relationship
          lasts.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          The quickest way to delete it: open your card page and press{' '}
          <strong>Remove my details</strong> at the bottom. It deletes the record straight away.
        </p>
        <p>
          You can also ask us to give you a copy of everything we hold about you, correct it, delete
          it, or stop using it altogether. Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>{' '}
          and we will act on it — there is no form to fill in and no account to create.
        </p>
        <p>
          If you are not satisfied with how we handle it, you can complain to the Information
          Commissioner&rsquo;s Office at{' '}
          <a
            href="https://ico.org.uk"
            className="text-accent underline underline-offset-2"
            rel="noopener noreferrer"
          >
            ico.org.uk
          </a>
          .
        </p>
      </Section>

      <Section title="If you leave your email or mobile on your page">
        <p>
          On the page you open, you can choose what matters to you from a short list. You can also
          leave an email address or mobile number so the person you met can send you their note. You
          give these yourself. We use them only for that, and <strong>Remove my details</strong>{' '}
          deletes them with the rest of your record.
        </p>
      </Section>

      <Section title="If you request early access on our older page">
        <p>
          The early-access form on our older page (/legacy) is separate from the pilot request form.
          It collects your name, work email, role and company, and the next event you are attending,
          if you give one. We also note whether you arrived from one of our cards. We use these
          details only to contact you about early access and to choose the founding group. Our
          lawful basis is your consent, which you give by ticking the box on the form and can
          withdraw at any time.
        </p>
        <p>
          To have your request deleted, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>{' '}
          and we will remove it.
        </p>
      </Section>

      <Section title="What we do not do">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>We do not add you to a marketing list.</li>
          <li>We do not email you unless you asked us to.</li>
          <li>We do not sell your information to anyone.</li>
          <li>We do not track you across other websites.</li>
        </ul>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-line-soft mt-8 border-t pt-6">
      <h2 className="font-display text-ink text-lg font-semibold tracking-tight">{title}</h2>
      <div className="text-ink-2 mt-2 flex flex-col gap-3 text-[15px] leading-relaxed">
        {children}
      </div>
    </section>
  );
}
