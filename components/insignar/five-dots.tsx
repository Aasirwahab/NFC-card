'use client';

import { useRef } from 'react';
import { gsap, MQ, useGSAP } from '@/lib/motion/gsap';

const HOT = new Set([3, 11, 17, 26, 34]);

/** 60 dots; five light up. */
export function FiveDots() {
  const ref = useRef<SVGSVGElement>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MQ.ok, () => {
        gsap.fromTo(
          '.hot',
          { scale: 0.36, opacity: 0 },
          {
            scale: 1,
            opacity: 1,
            stagger: 0.25,
            duration: 0.7,
            ease: 'expo.out',
            scrollTrigger: { trigger: el, start: 'top 80%', once: true },
          },
        );
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <svg
      ref={ref}
      className="dots"
      viewBox="0 0 440 270"
      role="img"
      aria-label="Sixty dots, five of them lit"
    >
      {Array.from({ length: 60 }, (_, i) => {
        const x = 20 + (i % 10) * 42;
        const y = 20 + Math.floor(i / 10) * 42;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={5} fill="#3a3936" />
            {HOT.has(i) && (
              <circle
                className="hot"
                cx={x}
                cy={y}
                r={14}
                fill="#f2491c"
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
