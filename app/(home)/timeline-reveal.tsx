'use client';

import { useEffect, useRef } from 'react';

/**
 * Plays the timeline's entrance once, when it scrolls into view: the line draws,
 * then each step follows it. The steps are only hidden after this has mounted
 * ("armed"), so without JavaScript, or with reduced motion, they simply show.
 */
export function TimelineReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;

    list.classList.add('armed');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        // Next frame, so the hidden state is painted before the transition starts.
        requestAnimationFrame(() => list.classList.add('in'));
        observer.disconnect();
      },
      { threshold: 0.25 },
    );
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  return (
    <ol className="tl" ref={ref}>
      {children}
    </ol>
  );
}
