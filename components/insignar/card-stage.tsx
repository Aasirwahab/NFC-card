'use client';

import { useRef } from 'react';
import { gsap, MQ, useGSAP } from '@/lib/motion/gsap';
import { card } from '@/app/(marketing)/insignar/copy';

/* eslint-disable @next/next/no-img-element */
/** Signature moment 2: one pinned 100svh stage, four steps (name, back, tap point, QR). */
export function CardStage() {
  const sec = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const cardEl = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const secEl = sec.current;
      const stageEl = stage.current;
      const c = cardEl.current;
      if (!secEl || !stageEl || !c) return;
      const mm = gsap.matchMedia();

      mm.add(MQ.reduce, () => {
        secEl.classList.add('static');
        return () => secEl.classList.remove('static');
      });

      mm.add(MQ.ok, () => {
        const steps = gsap.utils.toArray<HTMLElement>('.step', secEl);
        const st = (i: number) => steps[i] ?? c;
        const W = () => c.offsetWidth;
        const H = () => c.offsetHeight;
        const focus = (fx: number, fy: number, s: number) => ({
          scale: s,
          x: () => -(fx - 0.5) * W() * s,
          y: () => -(fy - 0.5) * H() * s,
        });
        gsap.set(c, { rotateY: -16, rotateX: 7, scale: 0.92, transformPerspective: 1400 });
        gsap.set(steps, { opacity: 0 });
        gsap.set(st(0), { opacity: 1 });
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: stageEl,
            start: 'top top',
            end: '+=320%',
            pin: true,
            scrub: 0.6,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });
        tl.to(c, {
          rotateY: 0,
          rotateX: 0,
          duration: 1,
          ease: 'power2.inOut',
          ...focus(0.2, 0.28, 1.9),
        })
          .to(st(0), { opacity: 0, duration: 0.25 }, 1.1)
          .to(st(1), { opacity: 1, duration: 0.25 }, 1.3)
          .to(
            c,
            { rotateY: 180, duration: 1.1, ease: 'power2.inOut', ...focus(0.5, 0.5, 1.05) },
            1.3,
          )
          .to(st(1), { opacity: 0, duration: 0.25 }, 2.6)
          .to(st(2), { opacity: 1, duration: 0.25 }, 2.8)
          .to(c, { duration: 1, ease: 'power2.inOut', ...focus(0.33, 0.5, 2.3) }, 2.7)
          .to(st(2), { opacity: 0, duration: 0.25 }, 3.9)
          .to(st(3), { opacity: 1, duration: 0.25 }, 4.1)
          .to(c, { duration: 1, ease: 'power2.inOut', ...focus(0.69, 0.46, 2.3) }, 4);
        return () => {
          tl.scrollTrigger?.kill();
          tl.kill();
        };
      });

      return () => mm.revert();
    },
    { scope: sec },
  );

  return (
    <section ref={sec} className="stage-sec" id="card" aria-label={card.stepsAria}>
      <div className="wrap">
        <div ref={stage} className="stage">
          <div className="cardzone">
            <div ref={cardEl} className="card3d">
              <div className="face">
                <img
                  src="/insignar/card-front.svg"
                  alt="The INSIGNAR card, front, numbered A·07"
                  width={910}
                  height={610}
                />
              </div>
              <div className="face back">
                <img
                  src="/insignar/card-back.svg"
                  alt="The card, back, with the NFC point and QR code"
                  width={910}
                  height={610}
                />
              </div>
            </div>
          </div>
          <div className="steps">
            {card.items.map((s, i) => (
              <div key={s.n} className="step">
                <p className="fig">
                  FIG 2.{i + 1} · {s.n} / 04
                </p>
                <h2>{s.h}</h2>
                <p>{s.p}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
