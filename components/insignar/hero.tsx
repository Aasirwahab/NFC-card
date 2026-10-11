'use client';

/* eslint-disable @next/next/no-img-element */

import { useRef } from 'react';
import { gsap, MQ, SplitText, useGSAP } from '@/lib/motion/gsap';
import { sfx } from '@/lib/motion/sfx';
import { tokens } from '@/lib/motion/tokens';
import { hero } from '@/app/(marketing)/insignar/copy';

const GAP = 16;
const RING = 96;
const MAX_D = 480;

/** Dot-matrix ripple around the NFC point: rings every 96 px, vermilion dots fade with distance. p is 0..1. */
function drawDots(cv: HTMLCanvasElement, origin: HTMLElement, p: number) {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const box = cv.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(box.width * dpr);
  const h = Math.round(box.height * dpr);
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);
  const o = origin.getBoundingClientRect();
  const cx = o.left - box.left;
  const cy = o.top - box.top;
  const front = p * (MAX_D + 60);
  for (let x = 8; x < box.width; x += GAP) {
    for (let y = 8; y < box.height; y += GAP) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > MAX_D || d > front) continue;
      const hot = (d % RING) / RING < 0.12;
      const a = Math.max(0, 1 - d / MAX_D) * (hot ? 0.6 : 0.16);
      ctx.globalAlpha = a;
      ctx.fillStyle = hot ? tokens.color.vermBlock : tokens.color.ink;
      ctx.beginPath();
      ctx.arc(x, y, hot ? 3.2 : 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const h1 = useRef<HTMLHeadingElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const nfc = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      const canvas = cv.current;
      const origin = nfc.current;
      const title = h1.current;
      if (!el || !canvas || !origin || !title) return;
      const ins = el.closest<HTMLElement>('.ins');
      const ripple = { p: 1 };
      const draw = () => drawDots(canvas, origin, ripple.p);
      const ro = new ResizeObserver(draw);
      ro.observe(canvas);
      const mm = gsap.matchMedia();

      mm.add(MQ.reduce, () => {
        if (ins) ins.dataset.m = 'off';
        ripple.p = 1;
        draw();
      });

      mm.add(MQ.ok, () => {
        ripple.p = 0;
        draw();
        let cancelled = false;
        let split: SplitText | null = null;
        let tl: gsap.core.Timeline | null = null;
        // Split only once the webfonts are in, otherwise line widths are measured with fallback metrics.
        void document.fonts.ready.then(() => {
          if (cancelled) return;
          split = SplitText.create(title, { type: 'words', wordsClass: 'w' });
          // One staged entrance, plays once, transform + opacity only, about 0.9 s: eyebrow, headline words,
          // sub and buttons, then the card visual and the example chip.
          tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
          tl.fromTo('.hero .ey', { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, 0)
            .fromTo(
              split.words,
              { y: 40, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.5, stagger: 0.06 },
              0.05,
            )
            .call(() => sfx.play('thock'), [], 0.05)
            .fromTo(
              '.hero .fi:not(.ey)',
              { y: 16, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.4, stagger: 0.1 },
              0.3,
            )
            .fromTo(
              '.hero .hc',
              { y: 40, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.5, stagger: 0.08 },
              0.3,
            )
            .fromTo(
              '.hero .hchip',
              { y: 12, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.35 },
              0.55,
            )
            .to(ripple, { p: 1, duration: 1.4, ease: 'power2.out', onUpdate: draw }, 0.3);
          if (ins) ins.dataset.m = 'on';
        });
        return () => {
          cancelled = true;
          tl?.kill();
          split?.revert();
          if (ins) ins.dataset.m = 'pre';
        };
      });

      // Slow scroll-linked push-in on the inner layer only (the masked parent stays static). No drift loop.
      mm.add(MQ.ok, () => {
        const inner = el.querySelector<HTMLElement>('.block-in');
        const tone = el.querySelector<HTMLElement>('.block-tone');
        if (!inner || !tone) return;
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: el,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
            // will-change only while the hero is on screen and animating
            onToggle: (self) => {
              inner.style.willChange = self.isActive ? 'transform' : '';
              tone.style.willChange = self.isActive ? 'opacity' : '';
            },
          },
        });
        tl.fromTo(inner, { scale: 1 }, { scale: 1.04 }, 0).to(tone, { opacity: 0 }, 0);
        return () => {
          tl.scrollTrigger?.kill();
          tl.kill();
          inner.style.willChange = '';
          tone.style.willChange = '';
        };
      });

      return () => {
        ro.disconnect();
        mm.revert();
      };
    },
    { scope: root },
  );

  return (
    <section ref={root} className="hero grain">
      <canvas ref={cv} aria-hidden="true" />
      <div className="wrap hero-grid">
        <div>
          <p className="fig fi ey">[ {hero.eyebrow} ]</p>
          <h1 ref={h1}>{hero.headline}</h1>
          <p className="sub fi">
            {hero.subStrong} <span>{hero.subSoft}</span>
          </p>
          <div className="cta fi">
            <a className="btn" href="#pilot">
              {hero.primary}
            </a>
            <a className="btn ghost" href="#film">
              {hero.secondary}
            </a>
          </div>
        </div>
        <div className="block-wrap">
          <div className="block" aria-hidden="true">
            <div className="block-in">
              <div className="hero-cards">
                <div className="hc back">
                  <img src="/insignar/card-back.svg" alt="" width={910} height={610} />
                </div>
                <div className="hc front">
                  <img src="/insignar/card-front.svg" alt="" width={910} height={610} />
                </div>
                <span ref={nfc} className="nfc" />
              </div>
            </div>
            <div className="block-tone" />
          </div>
          <div className="hchip">
            <div className="hchip-in">
              <span className="fig">{hero.chipCaption}</span>
              <q>{hero.chipQuote}</q>
            </div>
          </div>
          <p className="fig">{hero.fig}</p>
        </div>
      </div>
    </section>
  );
}
