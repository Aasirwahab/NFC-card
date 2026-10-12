'use client';

import { useEffect, useRef, useState } from 'react';
import styles from '@/app/ui-slice.module.css';

/** Dock the same control; the placeholder stays in flow for a stable observer target. */
export function StickyAction({
  children,
  enabled = true,
}: {
  children: React.ReactNode;
  enabled?: boolean;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const clearance = useRef<HTMLDivElement>(null);
  const control = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);

  useEffect(() => {
    if (!enabled || !anchor.current || typeof IntersectionObserver === 'undefined') return;
    const target = anchor.current;
    const action = control.current?.firstElementChild;
    const page = target.closest<HTMLElement>(`.${styles.prospectPage}`);
    const previousHeight = page?.style.getPropertyValue('--book-bar-height');
    let observer: IntersectionObserver;
    function observe() {
      observer?.disconnect();
      const height = action?.getBoundingClientRect().height ?? 52;
      target.style.minHeight = `${height}px`;
      page?.style.setProperty(
        '--book-bar-height',
        `calc(${height + 21}px + env(safe-area-inset-bottom, 0px))`,
      );
      const bottom = clearance.current?.getBoundingClientRect().height ?? 73;
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry) setDocked(entry.intersectionRatio < 1);
        },
        { rootMargin: `0px 0px -${bottom}px 0px`, threshold: 1 },
      );
      observer.observe(target);
    }
    observe();
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(observe);
    if (action) resizeObserver?.observe(action);
    window.addEventListener('resize', observe);
    return () => {
      observer.disconnect();
      resizeObserver?.disconnect();
      if (previousHeight) page?.style.setProperty('--book-bar-height', previousHeight);
      else page?.style.removeProperty('--book-bar-height');
      window.removeEventListener('resize', observe);
    };
  }, [enabled]);

  return (
    <div ref={anchor} className={styles.stickyAction} data-docked={enabled && docked}>
      <div ref={clearance} className={styles.stickyClearance} aria-hidden="true" />
      <div ref={control} className={styles.stickyActionControl}>
        {children}
      </div>
    </div>
  );
}
