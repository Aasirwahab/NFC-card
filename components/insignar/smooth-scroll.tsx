'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { gsap, MQ, ScrollTrigger } from '@/lib/motion/gsap';

/**
 * Smooth wheel scrolling for the landing only. Touch keeps native scrolling (Lenis default),
 * and reduced motion turns it off. Lenis runs on GSAP's ticker so pinned and scrubbed
 * ScrollTriggers stay in step with the scroll position.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (!window.matchMedia(MQ.ok).matches) return;
    const lenis = new Lenis({
      lerp: 0.12,
      // in-page links (#pilot, #film) glide; scroll-margin-top keeps them below the sticky header
      anchors: true,
    });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
    };
  }, []);
  return null;
}
