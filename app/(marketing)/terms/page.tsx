import type { Metadata } from 'next';
import Link from 'next/link';
import { OG_IMAGE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Pilot terms (draft)',
  description:
    'The INSIGNAR pilot terms for a rep’s company, in draft and under legal review. Items in square brackets are not settled yet.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/terms' },
  openGraph: { title: 'Pilot terms (draft) · INSIGNAR', url: '/terms', images: [OG_IMAGE] },
  twitter: { card: 'summary_large_image', images: [OG_IMAGE] },
};

/**
 * Source: docs/LEGAL_DRAFTS.md sections 3 and 4 (2026-11-06). The wording is the draft's,
 * unchanged. Only a lawyer edits the clauses; the bracketed items are facts the founder
 * still has to supply.
 */
const terms: [string, string][] = [
  [
    'What you get.',
    'Up to [10] numbered cards per rep, access to the INSIGNAR rep app, and support by [CONTACT]. The pilot is [FREE / £X].',
  ],
  [
    'Roles.',
    '[OPTION A: The Company decides why and how prospect details are used, so it is the controller; INSIGNAR processes them on its behalf and only on its instructions. OPTION B: INSIGNAR is a controller in its own right for the prospect pages it hosts.] A solicitor chooses A or B.',
  ],
  [
    'What INSIGNAR does with prospect details.',
    'Stores what the rep captures, looks up public company and LinkedIn links the rep chooses, writes the page, shows the privacy notice, deletes on request or after [12] months of no activity.',
  ],
  [
    'The Company’s duties.',
    'Capture only business contact details, tell people who the cards are from, follow the email rules in section 4, and tell INSIGNAR at once if someone asks to be deleted or complains.',
  ],
  [
    'Providers.',
    'INSIGNAR uses the providers in the current list [LINK] and will give notice of changes.',
  ],
  [
    'Security and incidents.',
    '[CONTACT] is told within [72] hours of any personal-data incident INSIGNAR becomes aware of.',
  ],
  [
    'No promises.',
    'The pilot is for learning: no guarantee of uptime or results. Either side may end it by writing.',
  ],
  ['Law.', 'England and Wales.'],
];

const messageRules = [
  'Say who you are and which company you represent, in every message.',
  'Email to a work address at a company (name@company.co.uk): fine, in a business context, about what you discussed.',
  'Do not cold-email a sole trader, a partnership of individuals, or a personal address (gmail, outlook, icloud) unless they gave you their address and asked to hear from you. When unsure, use a LinkedIn message or ask them in person.',
  'Every message offers a plain way to stop (“Reply stop and I won’t write again”). If someone says stop, tell INSIGNAR and do not message them again.',
  'Never put anything in the note or the page you would not say to their face.',
  'If a prospect asks you to delete their details: use the “Remove my details” link on their page or tell INSIGNAR the same day.',
  'WhatsApp and text count as marketing messages too: only with their agreement.',
];

export default function TermsPage() {
  return (
    <article className="max-w-xl">
      <h1 className="font-display text-ink text-3xl font-bold tracking-tight">Pilot terms</h1>
      <p
        role="note"
        className="border-warn bg-warn-bg text-ink mt-4 rounded-lg border-l-4 px-4 py-3 text-[15px]"
      >
        <strong>Draft, under legal review.</strong> These are the pilot terms as drafted on 6
        November 2026. They may change before anyone signs. Items in square brackets are not settled
        yet.
      </p>

      <p className="text-ink-2 mt-5 text-lg">
        <strong>INSIGNAR pilot terms.</strong> Between [INSIGNAR LEGAL ENTITY] (“INSIGNAR”) and
        [REP’S COMPANY] (“the Company”), starting [DATE] for [6 WEEKS].
      </p>

      <ol className="text-ink-2 mt-6 list-decimal space-y-4 pl-5 text-[15px] leading-relaxed">
        {terms.map(([head, text]) => (
          <li key={head}>
            <strong className="text-ink">{head}</strong> {text}
          </li>
        ))}
      </ol>
      <p className="text-ink-2 mt-4 text-[15px]">Signed [NAME, DATE] for each side.</p>
      <p className="text-ink-3 mt-2 text-sm">
        Standard processor clauses (UK GDPR Article 28(3)) must be added by a solicitor if Option A
        is chosen.
      </p>

      <h2 className="font-display text-ink border-line-soft mt-8 border-t pt-6 text-lg font-semibold tracking-tight">
        Follow-up message rules (the “email rules” in clause 4)
      </h2>
      <ol className="text-ink-2 mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed">
        {messageRules.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ol>

      <p className="text-ink-2 mt-8 text-sm">
        <Link href="/pricing" className="underline underline-offset-2">
          Pricing
        </Link>
        {' · '}
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy notice
        </Link>
        {' · '}
        <Link href="/#pilot" className="underline underline-offset-2">
          Request a pilot
        </Link>
      </p>
    </article>
  );
}
