import type { Metadata } from 'next';
import Link from 'next/link';
import { Hero } from '@/components/insignar/hero';
import { Film } from '@/components/insignar/film';
import { CardStage } from '@/components/insignar/card-stage';
import { Reveal } from '@/components/insignar/reveal';
import { Exploded } from '@/components/insignar/exploded';
import { FiveDots } from '@/components/insignar/five-dots';
import { PilotForm } from '@/components/insignar/pilot-form';
import { ProspectPage } from '@/components/insignar/prospect-page';
import { ManagerView } from '@/components/insignar/manager-view';
import { exploded, faq, film, five, footer, meta, page, pilot, steps } from './copy';
import './insignar.css';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
};

export default function InsignarPage() {
  return (
    <div className="ins" data-m="pre">
      <noscript>
        <style>{`.ins[data-m='pre'] .hero h1, .ins[data-m='pre'] .fi, .ins[data-m='pre'] .hchip, .ins[data-m='pre'] .hc { opacity: 1 !important; }`}</style>
      </noscript>

      <Hero />

      <section className="sec" id="page">
        <Reveal className="wrap two">
          <div>
            <p className="fig" data-rv>
              {page.label}
            </p>
            <h2 data-rv style={{ marginTop: 12 }}>
              {page.title}
            </h2>
            <p className="lead" data-rv>
              {page.lead}
            </p>
            <div className="trust">
              {page.trust.map((t) => (
                <div key={t.h} data-rv>
                  <b>{t.h}</b>
                  <span>{t.p}</span>
                </div>
              ))}
            </div>
          </div>
          <div data-rv>
            <ProspectPage />
          </div>
        </Reveal>
      </section>

      <section className="sec dark" id="film" aria-labelledby="film-h">
        <div className="wrap">
          <p className="fig">{film.label}</p>
          <h2 id="film-h" style={{ marginTop: 12 }}>
            {film.title}
          </h2>
          <Film />
        </div>
      </section>

      <section className="sec" id="how">
        <Reveal className="wrap">
          <div className="three">
            {steps.items.map((s, i) => (
              <div key={s.title} data-rv>
                <p className="fig">{steps.fig(i + 1)}</p>
                <h3>{s.title}</h3>
                <p className="lead2">{s.lead}</p>
                {s.body && <p className="b">{s.body}</p>}
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <CardStage />

      <section className="sec" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="wrap iso-wrap">
          <div>
            <p className="fig">{exploded.label}</p>
            <h2 style={{ marginTop: 12 }}>{exploded.title}</h2>
            {exploded.body && <p className="lead">{exploded.body}</p>}
            <p className="fig" style={{ marginTop: 18 }}>
              {exploded.fig}
            </p>
          </div>
          <Exploded />
        </div>
      </section>

      <section className="sec dark" id="five">
        <Reveal className="wrap">
          <p className="fig" data-rv>
            {five.label}
          </p>
          <div className="five-grid">
            <div>
              <h2 data-rv>{five.title}</h2>
              <p className="note" data-rv>
                {five.note}
              </p>
            </div>
            <FiveDots />
          </div>
          <ManagerView />
        </Reveal>
      </section>

      <section className="sec" id="pilot">
        <Reveal className="wrap pilot-grid">
          <div>
            <p className="fig" data-rv>
              {pilot.label}
            </p>
            <h2 data-rv style={{ marginTop: 12 }}>
              {pilot.title}
            </h2>
            {pilot.outline && (
              <p className="lead" data-rv>
                {pilot.outline}
              </p>
            )}
            <p data-rv>{pilot.trust}</p>
            <ul className="offer" data-rv>
              {pilot.offer.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </div>
          <div data-rv>
            <PilotForm />
          </div>
        </Reveal>
      </section>

      <section className="sec faq" style={{ borderTop: '1px solid var(--line)', paddingTop: 56 }}>
        <Reveal className="wrap">
          <p className="fig" data-rv>
            {faq.label}
          </p>
          <h2 data-rv style={{ margin: '12px 0 28px' }}>
            {faq.title}
          </h2>
          {faq.items.map((f) => (
            <details key={f.q} data-rv>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </Reveal>
      </section>

      <footer className="foot">
        <div className="wrap">
          <span>{footer.line}</span>
          <Link href="/insignar/transcript">{footer.readFilm}</Link>
          <Link href="/privacy">{footer.privacy}</Link>
        </div>
      </footer>
    </div>
  );
}
