'use client';

import { useRef } from 'react';
import { gsap, MQ, useGSAP } from '@/lib/motion/gsap';
import { card } from '@/app/(landing)/insignar/copy';

/* eslint-disable @next/next/no-img-element */
/** Signature moment 2: one pinned 100svh stage, four steps (name, back, tap point, QR). */
export function CardStage() {
  const sec = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const cardEl = useRef<HTMLDivElement>(null);
  const tiltEl = useRef<HTMLDivElement>(null);
  const flipEl = useRef<HTMLDivElement>(null);
  const shadowEl = useRef<HTMLDivElement>(null);
  const zoneEl = useRef<HTMLDivElement>(null);

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

      // Physical feel: pointer tilt, sheen, float, click flip. Wrapper layers keep these off the scroll timeline's
      // transforms on .card3d. Only transform/opacity are animated, all on the compositor.
      mm.add({ ok: MQ.ok, touch: '(hover: none)' }, (ctx) => {
        const tilt = tiltEl.current;
        const flip = flipEl.current;
        const shadow = shadowEl.current;
        const zone = zoneEl.current;
        if (!ctx.conditions?.ok || !tilt || !flip || !shadow || !zone) return;
        const sheens = gsap.utils.toArray<HTMLElement>('.sheen', secEl);
        const MAX = 12;
        gsap.set([tilt, flip], { transformPerspective: 1400 });
        gsap.set(sheens, { opacity: 0 });

        // slow idle float, <= 6px
        const float = gsap.to(tilt, {
          y: -5,
          duration: 3.4,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });
        const cleanup: Array<() => void> = [() => float.kill()];

        if (ctx.conditions.touch) {
          // no pointer to follow: a gentle device-free idle tilt
          const idle = gsap.timeline({
            repeat: -1,
            yoyo: true,
            defaults: { duration: 3.6, ease: 'sine.inOut' },
          });
          idle
            .fromTo(tilt, { rotateY: -7, rotateX: 3 }, { rotateY: 7, rotateX: -3 }, 0)
            .fromTo(sheens, { opacity: 0.5, xPercent: -18 }, { xPercent: 18 }, 0)
            .fromTo(shadow, { x: 10 }, { x: -10 }, 0);
          cleanup.push(() => idle.kill());
        } else {
          // quickTo needs GSAP's internal transform names; the rotateX/Y aliases can't be reset
          const rx = gsap.quickTo(tilt, 'rotationX', { duration: 0.5, ease: 'power3.out' });
          const ry = gsap.quickTo(tilt, 'rotationY', { duration: 0.5, ease: 'power3.out' });
          const sx = gsap.quickTo(sheens, 'xPercent', { duration: 0.5, ease: 'power3.out' });
          const sy = gsap.quickTo(sheens, 'yPercent', { duration: 0.5, ease: 'power3.out' });
          const so = gsap.quickTo(sheens, 'opacity', { duration: 0.4, ease: 'power2.out' });
          const shx = gsap.quickTo(shadow, 'x', { duration: 0.5, ease: 'power3.out' });
          const move = (e: PointerEvent) => {
            if (e.pointerType === 'touch') return;
            const r = zone.getBoundingClientRect();
            const nx = gsap.utils.clamp(-1, 1, ((e.clientX - r.left) / r.width) * 2 - 1);
            const ny = gsap.utils.clamp(-1, 1, ((e.clientY - r.top) / r.height) * 2 - 1);
            ry(nx * MAX);
            rx(-ny * MAX);
            sx(nx * 30);
            sy(ny * 30);
            so(1);
            shx(-nx * 22); // shadow slides opposite the lifted edge
          };
          const leave = () => {
            ry(0);
            rx(0);
            sx(0);
            sy(0);
            so(0);
            shx(0);
          };
          zone.addEventListener('pointermove', move);
          zone.addEventListener('pointerleave', leave);
          cleanup.push(() => {
            zone.removeEventListener('pointermove', move);
            zone.removeEventListener('pointerleave', leave);
          });
        }

        // click / tap / Enter / Space flips; always spins the same way
        const doFlip = () =>
          gsap.to(flip, {
            rotateY: '+=180',
            duration: 0.6,
            ease: 'power3.inOut',
            overwrite: 'auto',
          });
        const key = (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            doFlip();
          }
        };
        flip.addEventListener('click', doFlip);
        flip.addEventListener('keydown', key);
        cleanup.push(() => {
          flip.removeEventListener('click', doFlip);
          flip.removeEventListener('keydown', key);
        });
        return () => cleanup.forEach((fn) => fn());
      });

      return () => mm.revert();
    },
    { scope: sec },
  );

  return (
    <section ref={sec} className="stage-sec" id="card" aria-label={card.stepsAria}>
      <div className="wrap">
        <div ref={stage} className="stage">
          <div ref={zoneEl} className="cardzone">
            <div ref={cardEl} className="card3d">
              <div ref={shadowEl} className="card-shadow" aria-hidden="true" />
              <div ref={tiltEl} className="card-tilt">
                <div
                  ref={flipEl}
                  className="card-flip"
                  role="button"
                  tabIndex={0}
                  aria-label="Flip the card"
                >
                  {[-2, -1, 0, 1, 2].map((z) => (
                    <span
                      key={z}
                      className="edge"
                      style={{ transform: `translateZ(${z}px)` }}
                      aria-hidden="true"
                    />
                  ))}
                  <div className="face">
                    <img
                      src="/insignar/card-front.svg"
                      alt="The INSIGNAR card, front, numbered A·07"
                      width={910}
                      height={610}
                    />
                    <span className="sheen" aria-hidden="true" />
                  </div>
                  <div className="face back">
                    <img
                      src="/insignar/card-back.svg"
                      alt="The card, back, with the NFC point and QR code"
                      width={910}
                      height={610}
                    />
                    <span className="sheen" aria-hidden="true" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="steps">
            {card.items.map((s) => (
              <div key={s.n} className="step">
                <p className="fig">{s.n}</p>
                <h2>{s.h}</h2>
                {s.p && <p>{s.p}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
