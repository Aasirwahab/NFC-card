'use client';

import { useRef, type ReactNode } from 'react';
import { gsap, MQ, ScrollTrigger, useGSAP } from '@/lib/motion/gsap';

/** Fades and lifts every `[data-rv]` descendant in as it scrolls into view. Static under reduced motion. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MQ.ok, () => {
        const items = gsap.utils.toArray<HTMLElement>('[data-rv]', el);
        gsap.set(items, { opacity: 0, y: 24 });
        ScrollTrigger.batch(items, {
          start: 'top 90%',
          once: true,
          onEnter: (els) =>
            gsap.to(els, {
              opacity: 1,
              y: 0,
              duration: 0.6,
              ease: 'power3.out',
              stagger: 0.08,
              overwrite: true,
            }),
        });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
