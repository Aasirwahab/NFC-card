'use client';

import { useRef } from 'react';
import { gsap, MQ, useGSAP } from '@/lib/motion/gsap';
import { page } from '@/app/(landing)/insignar/copy';

/**
 * The prospect's page, shown on a phone: five parts, in order, always with a way out.
 * The phone is always phone-sized. With motion on, the page scrolls inside it as the section
 * scrolls by; with reduced motion the visitor scrolls the phone themselves.
 * `inert`: it is a picture of the page, so its buttons are not clickable or focusable here.
 */
export function ProspectPage() {
  const screen = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const shell = screen.current;
      const view = viewport.current;
      const content = scroller.current;
      if (!shell || !view || !content) return;
      const mm = gsap.matchMedia();
      mm.add(MQ.ok, () => {
        view.classList.add('driven');
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: shell,
            // begin once the whole phone is in view; finish while its lower half still is
            start: 'top 18%',
            end: 'bottom 45%',
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });
        tl.to(content, {
          y: () => -Math.max(0, content.scrollHeight - view.clientHeight),
          ease: 'none',
        });
        return () => {
          tl.scrollTrigger?.kill();
          tl.kill();
          view.classList.remove('driven');
        };
      });
      return () => mm.revert();
    },
    { scope: screen },
  );

  return (
    <div className="phone" aria-label={page.figs} role="img">
      <div className="phone-screen" ref={screen}>
        <div className="phone-bar" aria-hidden="true">
          <span>{page.time}</span>
          <span className="island" />
          <svg viewBox="0 0 38 12" width="38" height="12">
            <rect x="0" y="7" width="3" height="5" rx="1" />
            <rect x="5" y="5" width="3" height="7" rx="1" />
            <rect x="10" y="2.5" width="3" height="9.5" rx="1" />
            <rect x="21" y="1.5" width="15" height="9" rx="2.5" fill="none" stroke="currentColor" />
            <rect x="23" y="3.5" width="10" height="5" rx="1.2" />
          </svg>
        </div>
        <div className="phone-url">
          <svg viewBox="0 0 10 12" width="9" height="11" aria-hidden="true">
            <rect x="1" y="5" width="8" height="7" rx="1.5" />
            <path
              d="M3 5V3.5a2 2 0 0 1 4 0V5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            />
          </svg>
          {page.url}
        </div>
        <div className="phone-view" ref={viewport}>
          <div className="phone-scroll" ref={scroller}>
            <article className="pg" inert>
              <header>
                <span className="who" aria-hidden="true">
                  {page.initial}
                </span>
                <p>{page.header}</p>
                <span className="tag ex">{page.example}</span>
              </header>
              <section>
                <p className="tag">{page.one.h}</p>
                <q>{page.one.q}</q>
                <p className="srcs">{page.one.by}</p>
              </section>
              <section>
                <p className="tag">{page.two.h}</p>
                <p className="rng">{page.two.range}</p>
                <div className="rbar" aria-hidden="true">
                  <i />
                </div>
                <p className="srcs">{page.two.sources.join(' ')}</p>
                <p className="srcs ok">{page.two.confirmed}</p>
              </section>
              <section>
                <p className="tag">{page.three.h}</p>
                <p className="quote">{page.three.q}</p>
              </section>
              <section>
                <p className="tag">{page.four.h}</p>
                <p>{page.four.p}</p>
              </section>
              <section>
                <p className="tag">{page.five.h}</p>
                <ol>
                  {page.five.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <div className="actions">
                  <button type="button" className="btn">
                    {page.five.book}
                  </button>
                  <span className="srcs">{page.five.forward}</span>
                </div>
                <button type="button" className="linkish">
                  {page.five.remove}
                </button>
                {page.five.ai && <p className="ai">{page.five.ai}</p>}
              </section>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
