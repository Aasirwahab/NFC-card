'use client';

import { useEffect, useRef } from 'react';
import { page } from '@/app/(landing)/insignar/copy';

/**
 * The prospect's page, shown on a phone: five parts, in order, always with a way out.
 * The screen scrolls like a real phone (wheel, trackpad, touch or keyboard); when it reaches
 * the end, scrolling carries on down the landing. The buttons are drawn, not live: it is an example.
 */
export function ProspectPage() {
  const view = useRef<HTMLDivElement>(null);

  // Wheel: scroll the phone while it has room in that direction and keep the event from the
  // page's smooth scroller; at either end let it through so the landing scrolls on. (Browser
  // scroll chaining under a smooth scroller is unreliable, so this is done explicitly.)
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    // Where a glide is heading, so quick ticks add up instead of restarting mid-glide.
    // It expires after a short pause, so it can never go stale.
    let target = 0;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollHeight - el.clientHeight;
      const now = performance.now();
      const from = now - last < 200 ? target : el.scrollTop;
      // 3px slack: sub-pixel layout keeps the reachable end a pixel or two short of `max`
      const room = e.deltaY > 0 ? from < max - 3 : from > 3;
      if (!room) return;
      e.preventDefault();
      e.stopPropagation();
      const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      target = Math.min(max, Math.max(0, from + step));
      last = now;
      // trackpads send many small deltas: follow them directly; mouse wheels glide
      el.scrollTo({ top: target, behavior: Math.abs(step) < 40 ? 'auto' : 'smooth' });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="phone-wrap">
      <div className="phone">
        <div className="phone-screen">
          <div className="phone-bar" aria-hidden="true">
            <span>{page.time}</span>
            <span className="island" />
            <svg viewBox="0 0 38 12" width="38" height="12">
              <rect x="0" y="7" width="3" height="5" rx="1" />
              <rect x="5" y="5" width="3" height="7" rx="1" />
              <rect x="10" y="2.5" width="3" height="9.5" rx="1" />
              <rect
                x="21"
                y="1.5"
                width="15"
                height="9"
                rx="2.5"
                fill="none"
                stroke="currentColor"
              />
              <rect x="23" y="3.5" width="10" height="5" rx="1.2" />
            </svg>
          </div>
          <div className="phone-url" aria-hidden="true">
            <svg viewBox="0 0 10 12" width="9" height="11">
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
          <div ref={view} className="phone-view" role="region" aria-label={page.figs} tabIndex={0}>
            <article className="pg">
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
                  <span className="btn">{page.five.book}</span>
                  <span className="srcs">{page.five.forward}</span>
                </div>
                <span className="linkish">{page.five.remove}</span>
                {page.five.ai && <p className="ai">{page.five.ai}</p>}
              </section>
            </article>
          </div>
        </div>
      </div>
      <p className="phone-hint">{page.hint}</p>
    </div>
  );
}
