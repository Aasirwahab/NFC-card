import type { Metadata } from 'next';
import Link from 'next/link';
import { PRICE } from '@/app/(marketing)/pricing/copy';
import { OG_IMAGE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Digital business card vs introduction software',
  description:
    'A digital business card shares your details. Introduction software follows up on what the other person told you. What differs, what it costs, and when each fits.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/vs/digital-business-cards' },
  openGraph: {
    title: 'Digital business card vs introduction software · INSIGNAR',
    url: '/vs/digital-business-cards',
    images: [OG_IMAGE],
  },
  twitter: { card: 'summary_large_image', images: [OG_IMAGE] },
};

const rows: [string, string, string][] = [
  [
    'What it shares',
    'Your name, role and contact details',
    'A page about the other person’s problem',
  ],
  ['Who it is about', 'You', 'Them'],
  ['Built from', 'A profile you fill in once', 'What they told you, noted after the conversation'],
  ['What it asks them to do', 'Save your contact', 'Book a meeting'],
  [
    'Best for',
    'Being easy to find and save',
    'A few high-value conversations you need to turn into meetings',
  ],
];

export default function ComparePage() {
  return (
    <article className="max-w-xl">
      <h1 className="font-display text-ink text-3xl font-bold tracking-tight">
        Digital business card vs introduction software
      </h1>
      <p className="text-ink-2 mt-4 text-lg">
        A digital business card shares who you are. Introduction software follows up on what the
        other person told you.
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead>
            <tr className="border-line-soft border-b">
              <th className="text-ink py-2 pr-4 font-semibold"> </th>
              <th className="text-ink py-2 pr-4 font-semibold">Digital business card</th>
              <th className="text-ink py-2 font-semibold">INSIGNAR</th>
            </tr>
          </thead>
          <tbody className="text-ink-2">
            {rows.map(([a, b, c]) => (
              <tr key={a} className="border-line-soft border-b align-top">
                <th scope="row" className="text-ink py-3 pr-4 font-medium">
                  {a}
                </th>
                <td className="py-3 pr-4">{b}</td>
                <td className="py-3">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-display text-ink mt-10 text-xl font-bold">
        When a digital card is enough
      </h2>
      <p className="text-ink-2 mt-2">
        If you meet many people briefly and only need them to have your details, a digital business
        card does that well. INSIGNAR is not a replacement for that.
      </p>

      <h2 className="font-display text-ink mt-8 text-xl font-bold">When it is not</h2>
      <p className="text-ink-2 mt-2">
        If you meet a small number of people whose problem you could actually help with, a contact
        card gives them nothing to act on. INSIGNAR turns what they said into a short page that ends
        in one step: book a meeting.
      </p>

      <h2 className="font-display text-ink mt-8 text-xl font-bold">
        Why not a one-off NFC card with free software?
      </h2>
      <p className="text-ink-2 mt-2">
        You can, and for many people it is the better buy. A one-off card with free software costs
        you the card once. INSIGNAR costs £{PRICE.perRepPerMonth} per rep per month, or £
        {PRICE.founding.total} for the first {PRICE.founding.months} months in the founding offer.
      </p>
      <p className="text-ink-2 mt-3">
        What the extra money buys: a card shares your details, while INSIGNAR gives the person a
        page written about their own problem, and tells you what they opened and asked so you know
        who to call first. If you only need people to save your details, pay once for the card.
        INSIGNAR has no customers yet, so we cannot show results; see{' '}
        <Link href="/pricing" className="underline underline-offset-2">
          pricing
        </Link>{' '}
        for what is included.
      </p>

      <p className="text-ink-2 mt-8 text-sm">
        INSIGNAR is pre-launch; a UK founding pilot is open by request.{' '}
        <Link href="/facts" className="underline underline-offset-2">
          Facts
        </Link>
        {' · '}
        <Link href="/" className="underline underline-offset-2">
          Request a pilot
        </Link>
      </p>
    </article>
  );
}
