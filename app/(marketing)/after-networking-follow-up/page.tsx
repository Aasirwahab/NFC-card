import type { Metadata } from 'next';
import Link from 'next/link';
import { OG_IMAGE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'How to follow up after a networking event',
  description:
    'Most follow-ups after a networking event repeat a contact card. Here is why they go unanswered, and what a page written about the conversation changes.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/after-networking-follow-up' },
  openGraph: {
    title: 'How to follow up after a networking event · INSIGNAR',
    url: '/after-networking-follow-up',
    images: [OG_IMAGE],
  },
  twitter: { card: 'summary_large_image', images: [OG_IMAGE] },
};

export default function AfterNetworkingFollowUpPage() {
  return (
    <article className="max-w-xl">
      <h1 className="font-display text-ink text-3xl font-bold tracking-tight">
        How to follow up after a networking event
      </h1>
      <p className="text-ink-2 mt-4 text-lg">
        The conversation went well. Then you hand over a card, or a link to your details, and wait.
        This page is about what happens next, and why a page written about the conversation can work
        better than another contact card.
      </p>

      <Section title="What happens after you hand over a card">
        <p>
          A contact card, paper or NFC, gives the other person your name, role and a way to reach
          you. They save it, or they mean to. Then the event ends, the inbox fills and your details
          sit among everyone else’s.
        </p>
      </Section>

      <Section title="Why most follow-ups go unanswered">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            They are about you. “Lovely to meet you, here is what we do” gives the reader nothing to
            act on.
          </li>
          <li>
            They are generic. A message that could have gone to anyone at the event reads like it
            did.
          </li>
          <li>
            They arrive late. Details fade within days, and so does the reason the person cared.
          </li>
          <li>
            They ask for too much, or too little. “Let me know if you’d like to chat” leaves the
            next step to the person with the least time.
          </li>
        </ul>
        <p className="mt-3">
          These are common-sense reasons, not measured results. INSIGNAR has no customers yet, so we
          have no data on reply rates.
        </p>
      </Section>

      <Section title="A page about the conversation, not a contact card">
        <p>
          With INSIGNAR, after the conversation you record what the person told you. INSIGNAR builds
          a private page for them about the problem they described, using what you wrote and public
          information. You hand over a numbered NFC / QR card; they tap it and the page opens in
          their phone browser. No app is needed.
        </p>
        <p className="mt-3">
          The page is about them and ends in one step: book a meeting. It has a small chat for their
          questions, and every page has a “Remove my details” control.
        </p>
        <p className="mt-3">
          You see what each person opened and asked, so you know who to call first. A contact card
          cannot tell you that. See{' '}
          <Link href="/vs/digital-business-cards" className="underline underline-offset-2">
            digital business card vs introduction software
          </Link>{' '}
          for the side-by-side.
        </p>
      </Section>

      <Section title="When a contact card is enough">
        <p>
          If you meet many people briefly and only need them to be able to find you, a contact card
          is the right tool and costs less. A page written about each conversation takes a minute of
          your time per person, so it suits the few people you most want a meeting with.
        </p>
      </Section>

      <Section title="Stage">
        <p>
          INSIGNAR is pre-launch. A UK founding pilot is open by request; see{' '}
          <Link href="/pricing" className="underline underline-offset-2">
            pricing
          </Link>{' '}
          and{' '}
          <Link href="/facts" className="underline underline-offset-2">
            facts
          </Link>
          . You can also read{' '}
          <Link href="/how-it-works" className="underline underline-offset-2">
            what the person you hand a card to sees
          </Link>
          .
        </p>
        <p className="mt-3">
          <Link href="/#pilot" className="underline underline-offset-2">
            Request a pilot
          </Link>
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-ink text-xl font-bold">{title}</h2>
      <div className="text-ink-2 mt-2">{children}</div>
    </section>
  );
}
