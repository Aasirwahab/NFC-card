import type { Metadata } from 'next';
import { Hero } from '@/components/insignar/hero';
import { FilmVideo } from '@/components/insignar/film-video';
import { CardStage } from '@/components/insignar/card-stage';
import { Exploded } from '@/components/insignar/exploded';
import { FiveDots } from '@/components/insignar/five-dots';
import { PilotForm } from '@/components/insignar/pilot-form';
import { ProspectPage } from '@/components/insignar/prospect-page';
import { ManagerView } from '@/components/insignar/manager-view';
import { exploded, faq, film, five, meta, page, pilot, steps } from './copy';
import './insignar.css';

export const metadata: Metadata = {
  title: { absolute: 'INSIGNAR | B2B Introduction & Follow-Up Software' },
  description: meta.description,
  // The root layout is noindex (prospect pages are private); the landing is the one public page.
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'INSIGNAR',
    title: meta.title,
    description: meta.description,
    url: '/',
    locale: 'en_GB',
  },
  twitter: { card: 'summary_large_image', title: meta.title, description: meta.description },
};

const siteUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');

/** Entity markup only: no ratings, reviews or prices exist yet, so none are claimed. */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'INSIGNAR',
      ...(siteUrl ? { url: siteUrl, logo: `${siteUrl}/icon.png` } : {}),
    },
    {
      '@type': 'SoftwareApplication',
      name: 'INSIGNAR',
      applicationCategory: 'BusinessApplication',
      description: meta.description,
      ...(siteUrl ? { url: siteUrl } : {}),
    },
  ],
};

export default function InsignarPage() {
  return (
    <div className="ins" data-m="pre">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <noscript>
        <style>{`.ins[data-m='pre'] .hero h1, .ins[data-m='pre'] .fi, .ins[data-m='pre'] .hchip, .ins[data-m='pre'] .hc { opacity: 1 !important; }`}</style>
      </noscript>

      <Hero />

      <section className="sec" id="page">
        <div className="wrap two">
          <div>
            <h2>{page.title}</h2>
            <p className="lead">{page.lead}</p>
            <div className="trust">
              {page.trust.map((t) => (
                <div key={t.h}>
                  <b>{t.h}</b>
                  <span>{t.p}</span>
                </div>
              ))}
            </div>
          </div>
          <ProspectPage />
        </div>
      </section>

      <section className="sec dark" id="film" aria-labelledby="film-h">
        <div className="wrap">
          <h2 id="film-h">{film.title}</h2>
          <FilmVideo />
        </div>
      </section>

      <section className="sec" id="how">
        <div className="wrap">
          <ol className="three">
            {steps.items.map((s, i) => (
              <li key={s.title}>
                <span className="num">{i + 1}</span>
                <h3>{s.title}</h3>
                <p className="lead2">{s.lead}</p>
                {s.body && <p className="b">{s.body}</p>}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <CardStage />

      <section className="sec" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="wrap iso-wrap">
          <div>
            <h2>{exploded.title}</h2>
            {exploded.body && <p className="lead">{exploded.body}</p>}
          </div>
          <div>
            <Exploded />
            {/* phones: the drawing is too small for its own labels, so they sit below it */}
            <ol className="iso-key" aria-hidden="true">
              {exploded.layers.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="sec dark" id="five">
        <div className="wrap">
          <div className="five-grid">
            <div>
              <h2>{five.title}</h2>
              <p className="note">{five.note}</p>
            </div>
            <FiveDots />
          </div>
          <ManagerView />
        </div>
      </section>

      <section className="sec" id="pilot">
        <div className="wrap pilot-grid">
          <div>
            <h2>{pilot.title}</h2>
            {pilot.outline && <p className="lead">{pilot.outline}</p>}
            <p className="lead">{pilot.trust}</p>
            <ul className="offer">
              {pilot.offer.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </div>
          <PilotForm />
        </div>
      </section>

      <section className="sec faq" style={{ borderTop: '1px solid var(--line)', paddingTop: 56 }}>
        <div className="wrap">
          <h2 style={{ marginBottom: 28 }}>{faq.title}</h2>
          {faq.items.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
