import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonStyles } from '@/components/ui/button';
import { OG_IMAGE } from '@/lib/site';
import { PRICE, copy, meta } from './copy';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  robots: { index: true, follow: true },
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: `${meta.title} · INSIGNAR`,
    description: meta.description,
    url: '/pricing',
    images: [OG_IMAGE],
  },
  twitter: { card: 'summary_large_image', images: [OG_IMAGE] },
};

const siteUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');

/** Same entity as the home page's SoftwareApplication, now with its prices. */
const unit = (price: number, text: string) => ({
  '@type': 'UnitPriceSpecification',
  price,
  priceCurrency: PRICE.currency,
  unitText: text,
});
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'INSIGNAR',
      applicationCategory: 'BusinessApplication',
      description: meta.description,
      ...(siteUrl ? { url: siteUrl } : {}),
      offers: [
        {
          '@type': 'Offer',
          name: 'Founding offer',
          description: `First ${PRICE.founding.months} months, ${PRICE.founding.cards} numbered cards included.`,
          price: PRICE.founding.total,
          priceCurrency: PRICE.currency,
          ...(siteUrl ? { url: `${siteUrl}/pricing` } : {}),
        },
        {
          '@type': 'Offer',
          name: 'Standard',
          price: PRICE.perRepPerMonth,
          priceCurrency: PRICE.currency,
          priceSpecification: unit(PRICE.perRepPerMonth, 'per rep per month'),
          ...(siteUrl ? { url: `${siteUrl}/pricing` } : {}),
        },
      ],
    },
  ],
};

const link = 'text-accent underline underline-offset-2';

export default function PricingPage() {
  const { founding, standard } = copy;
  return (
    <article className="max-w-xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <h1 className="font-display text-ink text-3xl font-bold tracking-tight">{copy.h1}</h1>
      <p className="text-ink-2 mt-4 text-lg">{copy.lead}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="border-accent bg-surface rounded-xl border-2 p-5">
          <h2 className="text-ink-3 text-sm font-semibold">{founding.label}</h2>
          <p className="font-display text-ink mt-2 text-4xl font-bold">{founding.price}</p>
          <p className="text-ink-2">{founding.per}</p>
          <ul className="text-ink-2 mt-3 space-y-1.5 text-[15px]">
            {founding.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <Link href="/#pilot" className={`${buttonStyles({ size: 'md' })} mt-5 w-full`}>
            {founding.cta}
          </Link>
        </section>
        <section className="border-line bg-surface rounded-xl border p-5">
          <h2 className="text-ink-3 text-sm font-semibold">{standard.label}</h2>
          <p className="font-display text-ink mt-2 text-4xl font-bold">{standard.price}</p>
          <p className="text-ink-2">{standard.per}</p>
          <ul className="text-ink-2 mt-3 space-y-1.5 text-[15px]">
            {standard.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      </div>

      <Section title={copy.getTitle}>
        <dl className="space-y-4">
          {copy.get.map(([term, text]) => (
            <div key={term}>
              <dt className="text-ink font-semibold">{term}</dt>
              <dd className="text-ink-2 mt-0.5">{text}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title={copy.stageTitle}>
        <p>{copy.stage}</p>
      </Section>

      <Section title={copy.cardTitle}>
        <p>{copy.card}</p>
        <p>
          <Link href="/vs/digital-business-cards" className={link}>
            {copy.cardLink}
          </Link>
        </p>
      </Section>

      <Section title={copy.faqTitle}>
        <dl className="space-y-4">
          {copy.faq.map(([q, a]) => (
            <div key={q}>
              <dt className="text-ink font-semibold">{q}</dt>
              <dd className="mt-0.5">{a}</dd>
            </div>
          ))}
        </dl>
        <p>
          <Link href="/terms" className={link}>
            {copy.termsLink}
          </Link>
        </p>
      </Section>

      <Link href="/#pilot" className={`${buttonStyles({ size: 'lg' })} mt-10 w-full sm:w-auto`}>
        {copy.cta}
      </Link>
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
