import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'INSIGNAR facts',
  description:
    'What INSIGNAR is, who it is for, how it works and what stage it is at. Plain statements, no marketing.',
  // The root layout is noindex; this reference page is public on purpose.
  robots: { index: true, follow: true },
  alternates: { canonical: '/facts' },
};

/** Plain, checkable statements only: no superlatives, ratings or unreleased features. */
const facts: [string, string][] = [
  [
    'What it is',
    'INSIGNAR is introduction and follow-up software for B2B teams. After a conversation at an event, the rep records what the person said. INSIGNAR builds a private page for that person about the problem they described.',
  ],
  [
    'How the person receives it',
    'The rep hands over an NFC / QR card. Tapping it opens the page in the phone browser. No app is needed.',
  ],
  [
    'How it differs from a digital business card',
    'A digital business card shares the rep’s contact details. INSIGNAR’s page is about the prospect’s problem and ends in one action: book a meeting.',
  ],
  [
    'Who it is for',
    'UK B2B founders, sales leads and teams who meet a small number of high-value people at events and want the follow-up to book meetings.',
  ],
  [
    'Privacy',
    'Every prospect page has a “Remove my details” control. The page uses what the rep wrote down and public information. See the privacy page for the controller and retention details.',
  ],
  [
    'Stage',
    'Pre-launch. A founding pilot is open by request for UK teams. There are no published prices, customer ratings or third-party certifications.',
  ],
  ['Contact', 'Request a pilot using the form on the home page.'],
];

export default function FactsPage() {
  return (
    <article className="max-w-xl">
      <h1 className="font-display text-ink text-3xl font-bold tracking-tight">INSIGNAR facts</h1>
      <p className="text-ink-2 mt-4">
        INSIGNAR is B2B introduction and follow-up software that turns event conversations into
        booked meetings.
      </p>
      <dl className="mt-8 space-y-6">
        {facts.map(([term, text]) => (
          <div key={term}>
            <dt className="text-ink font-semibold">{term}</dt>
            <dd className="text-ink-2 mt-1">{text}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
