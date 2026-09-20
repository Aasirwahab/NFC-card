export const metadata = {
  title: 'Privacy notice',
  description: 'What TapLead collects, why, and how to have it deleted.',
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
 *      purge cron in Phase 7 must be built to whatever number ends up on this page.
 */

const CONTROLLER = 'TapLead'; // TODO(zaid): registered company name
const CONTACT_EMAIL = 'privacy@taplead.app'; // TODO(zaid): a monitored address
const RETENTION = '12 months from the last activity on your record';

export default function PrivacyPage() {
  return (
    <article className="max-w-xl">
      <h1 className="font-display text-ink text-3xl font-bold tracking-tight">Privacy notice</h1>
      <p className="text-ink-3 mt-2 text-sm">Last updated 21 September 2026</p>

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

      <Section title="What we collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Your name and the company you work for.</li>
          <li>The business problem you described in conversation.</li>
          <li>A short note the person you met wrote to remember the conversation by.</li>
          <li>Your LinkedIn profile or email address, if you shared one.</li>
          <li>Publicly available information about your company, gathered from its website.</li>
          <li>
            Whether the card was tapped, and anything you typed into the chat or booking form.
          </li>
        </ul>
        <p>
          We collect this from the conversation you had, not from your device. Tapping the card does
          not transmit anything about you or your phone to us.
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
        <p>We use a small number of service providers to run TapLead:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Hosting and application delivery</li>
          <li>Database and authentication</li>
          <li>A language model provider, which generates the message text</li>
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
          You can ask us to give you a copy of everything we hold about you, correct it, delete it,
          or stop using it altogether. Email{' '}
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
