import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';

/** Client-only. Import from client components so GSAP never reaches the server bundle. */
gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);
ScrollTrigger.config({ ignoreMobileResize: true });

if (typeof document !== 'undefined' && document.fonts?.ready) {
  void document.fonts.ready.then(() => ScrollTrigger.refresh());
}

export const MQ = {
  reduce: '(prefers-reduced-motion: reduce)',
  ok: '(prefers-reduced-motion: no-preference)',
} as const;

export { gsap, ScrollTrigger, SplitText, useGSAP };
