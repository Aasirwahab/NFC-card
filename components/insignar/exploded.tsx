'use client';

import { useRef } from 'react';
import { gsap, MQ, useGSAP } from '@/lib/motion/gsap';
import { exploded } from '@/app/(marketing)/insignar/copy';

const BASE = [40, 120, 200, 290];
const ISO = 'matrix(.866 .5 -.866 .5 0 0)';
const EXTRA = [
  <circle key="a" cx="40" cy="40" r="16" fill="none" stroke="#121211" strokeWidth="1.2" />,
  <g key="b">
    <rect x="120" y="30" width="46" height="46" fill="none" stroke="#121211" strokeWidth="1.2" />
    <path d="M128 38h12v12h-12zM146 38h12v12h-12zM128 56h12v12h-12z" fill="#121211" />
  </g>,
  <g key="c">
    <circle
      cx="55"
      cy="63"
      r="28"
      fill="#f2491c"
      opacity=".12"
      stroke="#f2491c"
      strokeWidth="1.4"
    />
    <circle cx="55" cy="63" r="10" fill="none" stroke="#f2491c" strokeWidth="1.2" />
  </g>,
  null,
];

/** Exploded isometric card, drawn as lines. The layers separate as it scrolls into view. */
export function Exploded() {
  const ref = useRef<SVGSVGElement>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MQ.ok, () => {
        const layers = gsap.utils.toArray<SVGGElement>('.lyr', el);
        const leads = gsap.utils.toArray<SVGGElement>('.lead', el);
        const tl = gsap.timeline({
          scrollTrigger: { trigger: el, start: 'top 80%', end: 'center 50%', scrub: 0.6 },
        });
        layers.forEach((l, i) =>
          tl.fromTo(
            l,
            { y: 290 - (BASE[i] ?? 0) - (3 - i) * 14 },
            { y: 0, ease: 'power2.inOut', duration: 1 },
            0,
          ),
        );
        tl.fromTo(leads, { opacity: 0 }, { opacity: 1, stagger: 0.15, duration: 0.5 }, 0.6);
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <svg
      ref={ref}
      className="iso"
      viewBox="0 0 900 520"
      role="img"
      aria-label={`${exploded.fig}: ${exploded.layers.join(', ')}`}
    >
      {BASE.map((y, i) => (
        <g key={y} className="lyr">
          <g transform={`translate(300 ${y})`}>
            <g transform={ISO}>
              <rect
                width="190"
                height="126"
                rx="8"
                fill={i === 3 ? '#121211' : 'none'}
                stroke={i === 2 ? '#f2491c' : '#121211'}
                strokeWidth="1.4"
              />
              {EXTRA[i]}
            </g>
          </g>
        </g>
      ))}
      {BASE.map((y, i) => (
        <g key={`l${y}`} className="lead">
          <line
            x1={395}
            y1={y + 95}
            x2={640}
            y2={y + 10}
            stroke="#121211"
            strokeWidth=".8"
            strokeDasharray="3 3"
            opacity=".6"
          />
          <text x={648} y={y + 14}>
            {exploded.layers[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}
