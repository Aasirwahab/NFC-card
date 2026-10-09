'use client';

/* eslint-disable @next/next/no-img-element */

import { useRef, useState, useSyncExternalStore } from 'react';
import { gsap, MQ, useGSAP } from '@/lib/motion/gsap';
import { sfx, type SfxKind, type SfxOpt } from '@/lib/motion/sfx';
import { film } from '@/app/(marketing)/insignar/copy';
import { FilmCalm } from './film-calm';

/**
 * INSIGNAR film v6, the fast cut. One paused GSAP master timeline, 46 s.
 * Spec: insignar-design/film/FILM_V6_FAST_CUT.md. Reduced motion gets the calm v5 film (film-calm.tsx).
 */
const U = film.ui;
const B = film.beats;
const DURATION = 46;
const NC = 20;
const NR = 11;
const WAVE = Array.from(
  { length: 44 },
  (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)),
);
const LOW = ['£12k', '£61k', '£27k', '£80k', '£38k'];
const HIGH = ['£55k', '£19k', '£73k', '£40k', '£92k'];
const QUOTE = ['Tickets', 'double', 'after', 'every', 'release.'];
/** Beats drawn on the light canvas (captions switch to ink + #C8350F). */
const LIGHT = new Set([6, 7, 12, 16]);
const WHIP = new Set([2, 5, 11, 13, 16]);
const VERM = '#F2491C';
const VERM_INK = '#C8350F';
const SILENT_FROM = 15;
const SILENT_TO = 16.6;
const SRC_VOICE = '/insignar/voiceover.mp3';

const subscribeReduce = (cb: () => void) => {
  const m = window.matchMedia(MQ.reduce);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};
const getReduce = () => window.matchMedia(MQ.reduce).matches;

function Dots() {
  return (
    <div className="dg" aria-hidden="true">
      {Array.from({ length: NC * NR }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}

function Rows({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="erow">
          <i />
          <i />
          <i />
        </div>
      ))}
    </>
  );
}

function Phone({ cls, style }: { cls: string; style: React.CSSProperties }) {
  return (
    <div className={`pnl ph ${cls}`} style={style}>
      <p className="m">{U.pageTitle}</p>
      <p className="t" style={{ marginTop: '0.8cqi' }}>
        “Tickets double after every release.”
      </p>
      <div className="bar" style={{ width: '80%' }} />
      <div className="bar" style={{ width: '55%' }} />
      <div className="bar" style={{ width: '68%' }} />
    </div>
  );
}

function FilmFast() {
  const root = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const api = useRef<{ go: () => void; halt: () => void; sync: () => void }>(null);
  const voice = useRef<HTMLAudioElement | null>(null);
  const userPaused = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [sound, setSound] = useState(false);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const box = el.querySelector<HTMLElement>('.film-box');
      if (!box) return;
      const q = gsap.utils.selector(el);
      const bar = q('.prog i');
      const cam = q('.cam');
      const shk = q('.shk');
      /** n container-width percent as px, re-read on invalidate. */
      const c = (n: number) => () => (n * box.clientWidth) / 100;

      const debugRaw =
        process.env.NODE_ENV !== 'production'
          ? new URLSearchParams(window.location.search).get('filmT')
          : null;
      const debugT = debugRaw !== null && debugRaw !== '' ? Number(debugRaw) : null;
      const debug = debugT !== null && Number.isFinite(debugT);

      const tl = gsap.timeline({
        paused: true,
        defaults: { ease: 'power3.out', duration: 0.5 },
        onUpdate: () => {
          gsap.set(bar, { scaleX: tl.progress() });
          const v = voice.current;
          if (v && !v.paused && Math.abs(v.currentTime - tl.time()) > 0.3) {
            v.currentTime = tl.time();
          }
        },
        onComplete: () => {
          box.dataset.play = 'off';
          voice.current?.pause();
          setPlaying(false);
          setEnded(true);
        },
      });
      tlRef.current = tl;

      /* ---------- helpers ---------- */
      const fx = (kind: SfxKind, t: number, o?: SfxOpt) => {
        if (t >= SILENT_FROM && t < SILENT_TO) return; // the 15.0-16.6 s silence is sacred
        tl.call(() => sfx.play(kind, o), [], t);
      };
      const ticks = (from: number, n: number, gap: number, p0 = 1, p1 = 1) => {
        for (let i = 0; i < n; i++)
          fx('tick', from + i * gap, { pitch: p0 + ((p1 - p0) * i) / Math.max(1, n - 1) });
      };
      /** 2-frame camera shake (at 30 fps) on an impact. */
      const shake = (t: number, a = 1) => {
        tl.set(shk, { xPercent: 1.4 * a, yPercent: -1 * a, rotation: 0.5 * a }, t);
        tl.set(shk, { xPercent: -1.1 * a, yPercent: 0.9 * a, rotation: -0.4 * a }, t + 0.033);
        tl.set(shk, { xPercent: 0, yPercent: 0, rotation: 0 }, t + 0.066);
      };
      /** set + to instead of fromTo/immediateRender:false: stays correct when the playhead jumps (seek, debug frame). */
      const fromToLate = (
        tgt: gsap.TweenTarget,
        from: gsap.TweenVars,
        to: gsap.TweenVars,
        pos: number,
      ) => {
        const rest = { ...to };
        delete rest.immediateRender;
        tl.set(tgt, from, pos);
        tl.to(tgt, rest, pos);
      };
      const camTo = (t: number, from: number, to: number, d: number, ease = 'power2.out') =>
        fromToLate(cam, { scale: from }, { scale: to, duration: d, ease }, t);
      const sc = (n: number) => q(`.b${n}`);
      const k = (n: number, sel: string) => q(`.b${n} ${sel}`);

      /* ---------- scene visibility, whips, slow push per beat ---------- */
      B.forEach((b, i) => {
        const n = i + 1;
        const node = sc(n);
        if (WHIP.has(n)) {
          tl.set(node, { autoAlpha: 1, xPercent: 105, skewX: -14 }, b.start - 0.05);
          tl.to(
            node,
            { xPercent: 0, skewX: 0, duration: 0.22, ease: 'power3.out' },
            b.start - 0.05,
          );
          fx('whoosh', b.start - 0.08);
        } else {
          tl.set(node, { autoAlpha: 1 }, b.start);
        }
        if (WHIP.has(n + 1)) {
          tl.to(
            node,
            { xPercent: -105, skewX: 14, duration: 0.2, ease: 'power3.in' },
            b.end - 0.15,
          );
          tl.set(node, { autoAlpha: 0 }, b.end + 0.06);
        } else {
          tl.set(node, { autoAlpha: 0 }, b.end);
        }
      });

      /* ---------- 1 · 0.0 "You met him." card slams in ---------- */
      camTo(0, 1, 1.08, 1.2, 'none');
      tl.fromTo(
        k(1, '.c'),
        { scale: 2.6, rotate: 14, opacity: 0 },
        { scale: 1, rotate: -5, opacity: 1, duration: 0.17, ease: 'power4.in' },
        0.02,
      );
      tl.fromTo(
        k(1, '.ringc'),
        { scale: 0.5, opacity: 0.9 },
        { scale: 2.4, opacity: 0, duration: 0.55, ease: 'power2.out' },
        0.19,
      );
      tl.fromTo(k(1, '.chip'), { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25 }, 0.5);
      fx('hit', 0.17);
      shake(0.19, 1.3);

      /* ---------- 2 · 1.2 "Great conversation." quote bubble ---------- */
      camTo(1.2, 1, 1.03, 0.8, 'none');
      tl.fromTo(
        k(2, '.bub'),
        { scale: 0.55, y: 30, opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.4, ease: 'back.out(2.4)' },
        1.3,
      );
      tl.fromTo(k(2, '.l2'), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25 }, 1.62);
      tl.set(k(2, '.hl'), { color: VERM_INK }, 2.0);
      fromToLate(
        k(2, '.hl'),
        { scale: 1.25 },
        { scale: 1, duration: 0.3, ease: 'back.out(3)', immediateRender: false },
        2.0,
      );
      camTo(2.0, 1.03, 1.12, 0.6, 'power3.out');
      tl.fromTo(k(2, '.who'), { opacity: 0 }, { opacity: 1, duration: 0.2 }, 2.2);
      fx('tick', 1.45);
      fx('tick', 1.65);
      fx('tick', 2.0, { pitch: 1.3 });

      /* ---------- 3 · 2.6 "Then six more." six cards fan out ---------- */
      camTo(2.6, 1, 1.0, 0.01, 'none');
      tl.fromTo(
        k(3, '.fc'),
        { xPercent: 0, yPercent: 0, rotate: 0, scale: 0.7, opacity: 0 },
        {
          xPercent: (i: number) => (i - 2.5) * 45,
          yPercent: (i: number) => Math.abs(i - 2.5) * 4,
          rotate: (i: number) => (i - 2.5) * 9,
          scale: 1,
          opacity: 1,
          duration: 0.32,
          stagger: 0.1,
          ease: 'expo.out',
        },
        2.62,
      );
      camTo(3.3, 1, 1.1, 0.7, 'power2.inOut');
      fx('hit', 2.62);
      shake(2.64, 0.9);
      ticks(2.72, 6, 0.1, 1, 1.5);

      /* ---------- 4 · 4.0 "By Thursday?" calendar flips Mon to Thu ---------- */
      tl.fromTo(
        k(4, '.cal'),
        { scale: 0.9, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.2 },
        4.0,
      );
      [0, 1, 2, 3].forEach((d, i) => {
        tl.set(k(4, '.hlc'), { xPercent: d * 100, opacity: 1 }, 4.1 + i * 0.1);
        if (d < 3) tl.set(k(4, `.col${d}`), { opacity: 0.3 }, 4.2 + i * 0.1);
        fx('tick', 4.1 + i * 0.1, { pitch: 0.8 + i * 0.15 });
      });
      tl.fromTo(
        k(4, '.thu'),
        { opacity: 0, scale: 0.6 },
        { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(3)' },
        4.5,
      );
      camTo(4.5, 1, 1.12, 0.4, 'power3.out');
      shake(4.5, 0.8);
      fx('thock', 4.5);
      tl.to(
        k(4, '.thu'),
        { scale: 1.08, duration: 0.25, yoyo: true, repeat: 3, ease: 'sine.inOut' },
        5.0,
      );
      camTo(5.2, 1.12, 1.2, 0.8, 'power1.inOut');

      /* ---------- 5 · 6.0 "Gone." notes delete, the quote dissolves into dots ---------- */
      camTo(6.0, 1, 1.0, 0.01, 'none');
      tl.fromTo(
        k(5, '.notes'),
        { scale: 0.9, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.2 },
        6.05,
      );
      tl.fromTo(
        k(5, '.nl'),
        { scaleX: 1, opacity: 1 },
        {
          scaleX: 0,
          opacity: 0,
          duration: 0.18,
          stagger: 0.2,
          ease: 'power2.in',
          transformOrigin: 'right center',
        },
        6.3,
      );
      tl.to(k(5, '.nq'), { opacity: 0, scale: 1.06, duration: 0.16, ease: 'none' }, 7.0);
      tl.fromTo(k(5, '.fd'), { opacity: 0, yPercent: 0 }, { opacity: 1, duration: 0.01 }, 7.0);
      fromToLate(
        k(5, '.fd'),
        { yPercent: 0 },
        {
          yPercent: 3200,
          duration: 0.7,
          stagger: 0.035,
          ease: 'power2.in',
          immediateRender: false,
        },
        7.05,
      );
      tl.to(k(5, '.fd'), { opacity: 0, duration: 0.15, stagger: 0.035 }, 7.65);
      tl.to(k(5, '.notes'), { opacity: 0.2, duration: 0.3 }, 7.2);
      fx('rwhoosh', 6.0);
      ticks(6.3, 4, 0.2, 1.2, 0.8);

      /* ---------- 6 · 8.0 "same email as everyone" inbox floods ---------- */
      fromToLate(
        k(6, '.inbox'),
        { scale: 1 },
        { scale: 0.9, duration: 1.8, ease: 'power1.in', immediateRender: false },
        8.6,
      );
      tl.fromTo(
        k(6, '.erow'),
        { scale: 0.5, opacity: 0, y: 12 },
        {
          scale: 1,
          opacity: 1,
          y: 0,
          duration: 0.18,
          ease: 'back.out(2)',
          stagger: { each: 0.055, from: 'start' },
        },
        8.0,
      );
      camTo(8.0, 1, 1.0, 0.01, 'none');
      camTo(9.4, 1, 1.1, 0.5, 'power3.out');
      tl.fromTo(
        k(6, '.erow i:first-child'),
        { scale: 1 },
        { scale: 1.5, duration: 0.2, yoyo: true, repeat: 1, stagger: 0.02 },
        9.5,
      );
      ticks(8.0, 12, 0.11, 0.9, 2.2);
      fx('hit', 9.4);
      shake(9.42, 0.8);

      /* ---------- 7 · 10.5 "He doesn't open it." one email greys out, unread climbs ---------- */
      camTo(10.5, 1, 1.05, 2, 'none');
      tl.fromTo(
        k(7, '.crowd .erow'),
        { opacity: 0 },
        { opacity: 0.35, duration: 0.2, stagger: 0.03 },
        10.5,
      );
      tl.fromTo(
        k(7, '.big7'),
        { scale: 1.3, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.25, ease: 'power4.out' },
        10.55,
      );
      tl.to(k(7, '.big7'), { opacity: 0.28, duration: 0.5, ease: 'none' }, 11.0);
      tl.fromTo(
        k(7, '.unread'),
        { scale: 0.5, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(3)' },
        11.0,
      );
      [0, 1, 2].forEach((d) => {
        const at = 11.15 + d * 0.5;
        tl.set(k(7, `.n${d}`), { opacity: 1 }, at);
        if (d > 0) tl.set(k(7, `.n${d - 1}`), { opacity: 0 }, at);
        fromToLate(
          k(7, `.n${d}`),
          { scale: 1.4 },
          { scale: 1, duration: 0.25, ease: 'back.out(3)', immediateRender: false },
          at,
        );
        fx('thock', at, { pitch: 0.7 + d * 0.15 });
      });
      fx('riser', 10.55, { dur: 4.45 });
      tl.call(() => sfx.cut(), [], SILENT_FROM);

      /* ---------- 8 · 12.5 "The deal walks." card leaves, vermilion bleeds ---------- */
      camTo(12.5, 1, 1.0, 0.01, 'none');
      tl.fromTo(
        k(8, '.c'),
        { x: 0, rotate: -5, opacity: 1 },
        { x: c(70), rotate: 10, duration: 0.7, ease: 'power3.in' },
        12.6,
      );
      tl.fromTo(
        k(8, '.bleed'),
        { scaleX: 0 },
        { scaleX: 1, duration: 0.55, ease: 'power4.out', transformOrigin: 'left center' },
        12.9,
      );
      tl.fromTo(
        k(8, '.gone'),
        { scale: 1.4, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: 'expo.out' },
        13.4,
      );
      camTo(13.4, 1, 1.07, 1.1, 'power1.out');
      fx('hit', 13.4);
      shake(13.42, 1.2);
      tl.to(k(8, '.bleed, .gone'), { opacity: 0, duration: 0.35, ease: 'power2.in' }, 14.55);

      /* ---------- 9 · 15.0 silence, one dot, zoom through it ---------- */
      camTo(15, 1, 1, 0.01, 'none');
      tl.fromTo(
        k(9, '.dot'),
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)' },
        15.3,
      );
      tl.to(k(9, '.dot'), { scale: 90, duration: 0.3, ease: 'expo.in' }, 16.3);

      /* ---------- 10 · 16.6 "Not this time." the dot ripples into the grid, card returns ---------- */
      tl.fromTo(
        k(10, '.fill'),
        { opacity: 1 },
        { opacity: 0, duration: 0.35, ease: 'power2.out' },
        16.6,
      );
      camTo(16.6, 0.5, 1, 0.55, 'expo.out');
      tl.fromTo(
        k(10, '.dg i'),
        { scale: 0, opacity: 0 },
        {
          scale: 1,
          opacity: 0.3,
          duration: 0.4,
          ease: 'power2.out',
          stagger: { amount: 0.8, from: 'center', grid: [NC, NR] },
        },
        16.65,
      );
      fromToLate(
        k(10, '.dg i'),
        { scale: 1 },
        {
          scale: 2.2,
          opacity: 0.9,
          duration: 0.25,
          yoyo: true,
          repeat: 1,
          ease: 'sine.inOut',
          stagger: { amount: 1, from: 'center', grid: [NC, NR] },
          immediateRender: false,
        },
        17.2,
      );
      tl.fromTo(
        k(10, '.c'),
        { scale: 1.5, rotate: 8, opacity: 0 },
        { scale: 1, rotate: -5, opacity: 1, duration: 0.3, ease: 'power4.out' },
        17.2,
      );
      tl.fromTo(k(10, '.chip'), { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2 }, 17.6);
      camTo(17.6, 1, 1.07, 1.4, 'none');
      fx('tick', 16.6, { pitch: 0.7 });
      fx('thock', 17.2);
      shake(17.22, 0.6);

      /* ---------- 11 · 19.0 "Sixty seconds. His words." voice note, words lock into the page ---------- */
      camTo(19, 1, 1.0, 0.01, 'none');
      tl.fromTo(
        k(11, '.wave i'),
        { scaleY: 0.1 },
        {
          scaleY: (i: number) => WAVE[i % WAVE.length] ?? 0.5,
          duration: 0.3,
          stagger: 0.018,
          ease: 'back.out(2)',
        },
        19.1,
      );
      fromToLate(
        k(11, '.wave i'),
        { scaleY: (i: number) => WAVE[i % WAVE.length] ?? 0.5 },
        {
          scaleY: (i: number) => 0.2 + 0.8 * (WAVE[(i * 7 + 3) % WAVE.length] ?? 0.5),
          duration: 0.28,
          yoyo: true,
          repeat: 4,
          ease: 'sine.inOut',
          stagger: 0.01,
          immediateRender: false,
        },
        19.9,
      );
      tl.fromTo(k(11, '.pg11'), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 }, 19.5);
      QUOTE.forEach((_, i) => {
        const at = 20.0 + i * 0.35;
        tl.fromTo(
          k(11, `.qw${i}`),
          { x: c(-30 + i * 2), y: c(10), opacity: 0, scale: 1.6 },
          { x: 0, y: 0, opacity: 1, scale: 1, duration: 0.38, ease: 'expo.out' },
          at,
        );
        fx('tick', at + 0.2, { pitch: 1 + i * 0.12 });
      });
      tl.fromTo(
        k(11, '.lock'),
        { scale: 1.3, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(3)' },
        21.7,
      );
      fx('thock', 21.7);
      camTo(20.0, 1, 1.08, 1.8, 'power1.inOut');

      /* ---------- 12 · 22.0 "What it costs his company." the range spins up and locks ---------- */
      camTo(22, 1, 1, 0.01, 'none');
      tl.fromTo(k(12, '.cost'), { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25 }, 22.05);
      tl.fromTo(
        k(12, '.rl0'),
        { yPercent: 0 },
        { yPercent: -80, duration: 1.5, ease: 'power4.out' },
        22.25,
      );
      tl.fromTo(
        k(12, '.rl1'),
        { yPercent: 0 },
        { yPercent: -80, duration: 1.8, ease: 'power4.out' },
        22.35,
      );
      tl.fromTo(k(12, '.rest'), { opacity: 0 }, { opacity: 1, duration: 0.3 }, 23.3);
      tl.fromTo(
        k(12, '.range i'),
        { scaleX: 0 },
        { scaleX: 0.68, duration: 0.9, ease: 'power3.inOut' },
        23.1,
      );
      tl.fromTo(
        k(12, '.src'),
        { opacity: 0, y: 12, scale: 0.8 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'back.out(3)', stagger: 0.3 },
        24.0,
      );
      tl.fromTo(
        k(12, '.okc'),
        { opacity: 0, scale: 0.6 },
        { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(3)' },
        24.8,
      );
      camTo(23.6, 1, 1.07, 1.8, 'power1.inOut');
      for (let i = 0; i < 14; i++)
        fx('tick', 22.25 + i * (0.06 + i * 0.012), { pitch: 1.2 - i * 0.02 });
      fx('thock', 24.1);
      shake(24.12, 0.7);
      fx('tick', 24.4);
      fx('tick', 24.7);
      fx('thock', 24.8);

      /* ---------- 13 · 25.5 "A team like his that fixed it." case card, three steps ---------- */
      camTo(25.5, 1, 1.0, 0.01, 'none');
      tl.fromTo(
        k(13, '.case'),
        { x: c(60), opacity: 0 },
        { x: 0, opacity: 1, duration: 0.45, ease: 'expo.out' },
        25.6,
      );
      tl.fromTo(
        k(13, '.steps'),
        { y: c(8), opacity: 0 },
        { y: 0, opacity: 1, duration: 0.35 },
        26.2,
      );
      [0, 1, 2].forEach((d) => {
        const at = 27.0 + d * 0.7;
        tl.fromTo(
          k(13, `.ck${d} b`),
          { scale: 0 },
          { scale: 1, duration: 0.22, ease: 'back.out(3)' },
          at,
        );
        tl.fromTo(k(13, `.ck${d} u`), { opacity: 0 }, { opacity: 1, duration: 0.05 }, at + 0.1);
        tl.fromTo(
          k(13, `.ck${d}`),
          { x: 0 },
          { x: c(0.8), duration: 0.1, yoyo: true, repeat: 1 },
          at,
        );
        fx('tick', at, { pitch: 1 + d * 0.25 });
      });
      camTo(26.0, 1, 1.05, 1.6, 'power1.inOut');
      camTo(27.6, 1.05, 1.1, 1.4, 'power1.inOut');

      /* ---------- 14 · 29.0 "One page. About him." zoom through the tap point into the page ---------- */
      camTo(29, 1, 1.0, 0.01, 'none');
      tl.fromTo(
        k(14, '.zm'),
        { scale: 0.8, opacity: 0, rotate: -8 },
        { scale: 1, opacity: 1, rotate: 0, duration: 0.3, ease: 'back.out(2)' },
        29.0,
      );
      tl.fromTo(
        k(14, '.ringc'),
        { scale: 0.3, opacity: 0.9 },
        { scale: 1.8, opacity: 0, duration: 0.6, ease: 'power2.out', stagger: 0.2 },
        29.5,
      );
      fromToLate(
        k(14, '.zm'),
        { scale: 1 },
        { scale: 16, duration: 0.85, ease: 'power3.in', immediateRender: false },
        30.0,
      );
      tl.to(k(14, '.zm'), { opacity: 0, duration: 0.1, ease: 'none' }, 30.8);
      tl.fromTo(
        k(14, '.ph'),
        { scale: 0.15, opacity: 0, rotate: 6 },
        { scale: 1, opacity: 1, rotate: 0, duration: 0.55, ease: 'expo.out' },
        30.75,
      );
      camTo(31.3, 1, 1.12, 0.7, 'power1.out');
      fx('whoosh', 30.0);
      fx('thock', 30.8);
      shake(30.82, 0.7);

      /* ---------- 15 · 32.0 "He taps." the ripple fills the screen ---------- */
      camTo(32, 1, 1.0, 0.01, 'none');
      tl.fromTo(
        k(15, '.zm'),
        { scale: 0.9, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.25 },
        32.0,
      );
      tl.fromTo(
        k(15, '.ph'),
        { x: c(38), y: c(8), opacity: 0, rotate: 8 },
        { x: 0, y: 0, opacity: 1, rotate: -4, duration: 0.55, ease: 'power3.inOut' },
        32.25,
      );
      tl.fromTo(
        k(15, '.ringc'),
        { scale: 0, opacity: 0.9 },
        { scale: 14, opacity: 0, duration: 1.3, ease: 'power1.out', stagger: 0.25 },
        33.0,
      );
      tl.fromTo(
        k(15, '.dg i'),
        { scale: 0, opacity: 0 },
        {
          scale: 1,
          opacity: 0.35,
          duration: 0.3,
          stagger: { amount: 1.1, from: [0.24, 0.45], grid: [NC, NR] },
        },
        33.0,
      );
      fromToLate(
        k(15, '.ph'),
        { scale: 1 },
        { scale: 1.08, duration: 0.15, yoyo: true, repeat: 1, immediateRender: false },
        33.0,
      );
      camTo(33.0, 1, 1.1, 0.25, 'power3.out');
      camTo(33.3, 1.1, 1.0, 0.9, 'power2.inOut');
      fx('hit', 33.0);
      shake(33.02, 0.5);

      /* ---------- 16 · 34.5 "He reads it. Twice." scroll, read indicator ---------- */
      camTo(34.5, 1, 1.0, 0.01, 'none');
      tl.fromTo(k(16, '.pgv'), { y: c(6), opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 }, 34.55);
      tl.fromTo(k(16, '.pgi'), { y: 0 }, { y: c(-17), duration: 1.0, ease: 'power2.inOut' }, 34.9);
      tl.to(k(16, '.pgi'), { y: 0, duration: 0.18, ease: 'power3.in' }, 36.0);
      tl.to(k(16, '.pgi'), { y: c(-17), duration: 0.9, ease: 'power2.inOut' }, 36.3);
      tl.fromTo(
        k(16, '.read'),
        { scale: 0.5, opacity: 0, x: c(6) },
        { scale: 1, opacity: 1, x: 0, duration: 0.3, ease: 'back.out(3)' },
        34.8,
      );
      tl.set(k(16, '.r1'), { opacity: 0 }, 36.0);
      tl.set(k(16, '.r2'), { opacity: 1 }, 36.0);
      fromToLate(
        k(16, '.r2'),
        { scale: 1.5 },
        { scale: 1, duration: 0.3, ease: 'back.out(3)', immediateRender: false },
        36.0,
      );
      tl.fromTo(
        k(16, '.rmv'),
        { scale: 1 },
        { scale: 1.12, duration: 0.25, yoyo: true, repeat: 1 },
        37.0,
      );
      camTo(35.0, 1, 1.04, 1.0, 'power1.inOut');
      camTo(36.3, 1.04, 1.1, 1.1, 'power1.inOut');
      fx('rwhoosh', 34.45, { pitch: 1.3 });
      fx('whoosh', 36.0, { pitch: 1 });
      fx('tick', 36.0, { pitch: 1.4 });

      /* ---------- 17 · 37.5 "Booked." the slot slams in ---------- */
      camTo(37.5, 1, 1.0, 0.01, 'none');
      tl.fromTo(
        k(17, '.slots i'),
        { opacity: 0, scale: 0.7 },
        { opacity: 1, scale: 1, duration: 0.2, stagger: 0.02 },
        37.5,
      );
      tl.fromTo(
        k(17, '.pick'),
        { scale: 3.4, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.14, ease: 'power4.in' },
        37.7,
      );
      fromToLate(
        k(17, '.pnl.slotp'),
        { scale: 1 },
        { scale: 1.03, duration: 0.08, yoyo: true, repeat: 1, immediateRender: false },
        37.84,
      );
      tl.fromTo(
        k(17, '.meet'),
        { x: c(14), opacity: 0 },
        { x: 0, opacity: 1, duration: 0.4, ease: 'expo.out' },
        38.1,
      );
      camTo(37.84, 1.12, 1.0, 0.7, 'power3.out');
      camTo(39.0, 1, 1.06, 1.5, 'none');
      fx('deep', 37.84);
      shake(37.84, 1.6);

      /* ---------- 18 · 40.5 "Be the one they remember." five dots light one by one ---------- */
      camTo(40.5, 1, 1.0, 0.01, 'none');
      tl.fromTo(
        k(18, '.five span'),
        { scale: 0.6, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.25, stagger: 0.04 },
        40.5,
      );
      tl.fromTo(
        k(18, '.five span i'),
        { scale: 0 },
        { scale: 1, duration: 0.25, ease: 'back.out(3)', stagger: 0.32 },
        40.8,
      );
      tl.fromTo(
        k(18, '.five'),
        { scale: 1 },
        { scale: 1.12, duration: 0.22, yoyo: true, repeat: 1, ease: 'power2.out' },
        42.15,
      );
      camTo(40.5, 1.0, 1.12, 2, 'none');
      ticks(40.8, 5, 0.32, 0.9, 1.5);

      /* ---------- 19 · 42.5 end card ---------- */
      camTo(42.5, 1, 1.0, 0.01, 'none');
      tl.fromTo(
        k(19, '.mk'),
        { scale: 0.6, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)' },
        42.55,
      );
      tl.fromTo(k(19, '.cta2'), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, 43.9);
      fx('thock', 42.6, { pitch: 0.8 });
      tl.to({}, { duration: 0.01 }, DURATION - 0.01);

      /* ---------- karaoke captions ---------- */
      B.forEach((b, i) => {
        if (!b.line) return;
        const n = i + 1;
        const lt = LIGHT.has(n);
        const base = lt ? '#121211' : '#ffffff';
        const acc = lt ? VERM_INK : VERM;
        const ws = q(`.kc${n} .w`);
        const words = b.line.split(' ');
        const win = b.end - b.start - 0.3;
        const want = 0.28 * words.length + 0.04 * b.line.length;
        const total = Math.min(win, want);
        const wsum = words.reduce((a, w) => a + w.length + 2, 0);
        let t = b.start + 0.08;
        tl.set(q(`.kc${n}`), { autoAlpha: 1 }, b.start);
        tl.set(q(`.kc${n}`), { autoAlpha: 0 }, b.end);
        words.forEach((w, j) => {
          const dur = (total * (w.length + 2)) / wsum;
          const word = ws[j];
          if (!word) return;
          tl.set(word, { opacity: 1, color: acc }, t);
          if (b.key.includes(j)) {
            fromToLate(
              word,
              { scale: 1.15 },
              { scale: 1, duration: 0.3, ease: 'back.out(3)', immediateRender: false },
              t,
            );
          }
          tl.set(word, { color: base }, t + (j < words.length - 1 ? dur : 0.45));
          t += dur;
        });
      });

      /* ---------- player ---------- */
      const go = () => {
        box.dataset.play = 'on';
        tl.play();
        setPlaying(true);
        const v = voice.current;
        if (v && sfx.on) {
          v.currentTime = tl.time();
          v.play().catch(() => {});
        }
      };
      const halt = () => {
        box.dataset.play = 'off';
        tl.pause();
        sfx.cut();
        voice.current?.pause();
        setPlaying(false);
      };
      api.current = { go, halt, sync: () => {} };

      let io: IntersectionObserver | null = null;
      if (debug && debugT !== null) {
        userPaused.current = true;
        (window as unknown as { __filmTl?: gsap.core.Timeline }).__filmTl = tl;
        tl.time(Math.min(Math.max(debugT, 0), DURATION), false);
        gsap.set(bar, { scaleX: tl.progress() });
        requestAnimationFrame(() => box.scrollIntoView({ block: 'center', behavior: 'instant' }));
      } else {
        io = new IntersectionObserver(
          ([e]) => {
            if (!e) return;
            if (e.isIntersecting) {
              if (!userPaused.current && tl.progress() < 1) go();
            } else if (!tl.paused()) {
              halt();
            }
          },
          { threshold: 0.4 },
        );
        io.observe(box);
      }

      return () => {
        io?.disconnect();
        sfx.cut();
        voice.current?.pause();
        api.current = null;
        tlRef.current = null;
      };
    },
    { scope: root },
  );

  const toggle = () => {
    const tl = tlRef.current;
    const a = api.current;
    if (!tl || !a) return;
    if (tl.progress() >= 1) {
      userPaused.current = false;
      setEnded(false);
      tl.restart();
      a.go();
    } else if (tl.paused()) {
      userPaused.current = false;
      a.go();
    } else {
      userPaused.current = true;
      a.halt();
    }
  };

  const toggleSound = () => {
    if (sfx.on) {
      sfx.mute();
      voice.current?.pause();
      voice.current = null;
      setSound(false);
      return;
    }
    sfx.unlock();
    sfx.play('tick');
    setSound(true);
    // Optional voice-over: used only if the file exists and loads; absent file stays silent.
    const v = new Audio(SRC_VOICE);
    v.preload = 'auto';
    v.addEventListener('error', () => {
      if (voice.current === v) voice.current = null;
    });
    v.addEventListener(
      'canplay',
      () => {
        if (!sfx.on) return;
        voice.current = v;
        const tl = tlRef.current;
        if (tl && !tl.paused()) {
          v.currentTime = tl.time();
          v.play().catch(() => {});
        }
      },
      { once: true },
    );
  };

  return (
    <div ref={root}>
      <div
        className="film-box f6"
        data-play="off"
        role="img"
        aria-label={`${film.title} ${film.note} Full text in the transcript below.`}
      >
        <div className="shk">
          <div className="cam">
            {/* 1 */}
            <div className="b b1">
              <div className="mini-card c" style={{ left: '36cqi', top: '7cqi' }}>
                <img src="/insignar/card-front.svg" alt="" />
              </div>
              <span
                className="ringc"
                style={{ left: '43cqi', top: '8cqi', width: '14cqi', height: '14cqi' }}
              />
              <span
                className="chip"
                style={{
                  position: 'absolute',
                  left: '45.5cqi',
                  top: '29cqi',
                  color: '#ece9e2',
                  borderColor: '#6d6a62',
                  margin: 0,
                }}
              >
                Card {U.cardNo}
              </span>
            </div>
            {/* 2 */}
            <div className="b b2">
              <div className="pnl bub" style={{ left: '18cqi', top: '6cqi', width: '64cqi' }}>
                <p className="t" style={{ fontSize: '5.4cqi', lineHeight: 1.05 }}>
                  “Tickets{' '}
                  <span className="hl" style={{ display: 'inline-block' }}>
                    double
                  </span>
                </p>
                <p className="t l2" style={{ fontSize: '5.4cqi', lineHeight: 1.05 }}>
                  after every release.”
                </p>
                <p className="m who" style={{ marginTop: '1.6cqi', color: '#65625c' }}>
                  {U.heardBy}
                </p>
              </div>
            </div>
            {/* 3 */}
            <div className="b b3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="abs fc"
                  style={{ left: '40cqi', top: '7cqi', width: '20cqi' }}
                >
                  <div className="mini-card" style={{ position: 'relative', width: '100%' }}>
                    <img src="/insignar/card-front.svg" alt="" />
                  </div>
                  <span
                    className="chip"
                    style={{
                      display: 'block',
                      width: 'fit-content',
                      margin: '1cqi auto 0',
                      color: '#ece9e2',
                      borderColor: '#6d6a62',
                    }}
                  >
                    A·0{i + 2}
                  </span>
                </div>
              ))}
            </div>
            {/* 4 */}
            <div className="b b4">
              <div
                className="pnl cal"
                style={{
                  left: '14cqi',
                  top: '4cqi',
                  width: '72cqi',
                  padding: 0,
                  overflow: 'hidden',
                }}
              >
                <div style={{ position: 'relative' }}>
                  <div
                    className="hlc"
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: 0,
                      width: '20%',
                      background: 'rgba(242,73,28,0.22)',
                      opacity: 0,
                    }}
                  />
                  <div
                    className="thu"
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: '60%',
                      width: '20%',
                      border: '0.35cqi solid #f2491c',
                      opacity: 0,
                      zIndex: 2,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--f-display)',
                        fontWeight: 700,
                        fontSize: '4.4cqi',
                        color: VERM_INK,
                      }}
                    >
                      THU
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)' }}>
                    {['MON', 'TUE', 'WED', 'THU', 'FRI'].map((d, i) => (
                      <p key={d} className={`m col${i}`} style={{ padding: '1.6cqi 1.4cqi' }}>
                        {d}
                      </p>
                    ))}
                    {Array.from({ length: 15 }, (_, i) => (
                      <div key={i} className={`cell col${i % 5}`} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* 5 */}
            <div className="b b5">
              <div className="pnl notes" style={{ left: '28cqi', top: '4cqi', width: '44cqi' }}>
                <p className="m">Notes · event</p>
                {['Call back before Friday', 'Send the deck', 'Book the demo room'].map((l) => (
                  <p
                    key={l}
                    className="nl"
                    style={{ fontSize: '2.1cqi', margin: '1.2cqi 0', color: '#34332f' }}
                  >
                    {l}
                  </p>
                ))}
                <p
                  className="t nq"
                  style={{
                    fontSize: '3cqi',
                    margin: '1.2cqi 0',
                    paddingLeft: '1.4cqi',
                    borderLeft: '0.5cqi solid #f2491c',
                  }}
                >
                  “Tickets double after every release.”
                </p>
                <p
                  className="nl"
                  style={{ fontSize: '2.1cqi', margin: '1.2cqi 0', color: '#34332f' }}
                >
                  Follow up with everyone
                </p>
              </div>
              {Array.from({ length: 14 }, (_, i) => (
                <span
                  key={i}
                  className="dot fd"
                  style={{
                    left: `${31 + i * 2.7}cqi`,
                    top: `${17 + (i % 3) * 1.4}cqi`,
                    width: '1.2cqi',
                    height: '1.2cqi',
                    opacity: 0,
                  }}
                />
              ))}
            </div>
            {/* 6 */}
            <div className="b b6 lt">
              <div className="inbox" style={{ left: '6cqi', top: '3cqi', width: '88cqi' }}>
                <Rows n={24} />
              </div>
            </div>
            {/* 7 */}
            <div className="b b7 lt">
              <div className="inbox crowd" style={{ left: '6cqi', top: '17cqi', width: '88cqi' }}>
                <Rows n={8} />
              </div>
              <div
                className="pnl big7"
                style={{ left: '8cqi', top: '4cqi', width: '58cqi', padding: '2cqi 2.4cqi' }}
              >
                <p className="m">{U.emailTag}</p>
                <p
                  style={{
                    fontSize: '2.1cqi',
                    marginTop: '1cqi',
                    color: '#34332f',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {U.email[1]}
                </p>
              </div>
              <div
                className="pnl unread"
                style={{ left: '70cqi', top: '4cqi', width: '22cqi', textAlign: 'center' }}
              >
                <p className="m">Unread</p>
                <div style={{ position: 'relative', height: '8cqi' }}>
                  {[1, 2, 3].map((v, d) => (
                    <span
                      key={v}
                      className={`n${d}`}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        opacity: 0,
                        fontFamily: 'var(--f-display)',
                        fontWeight: 700,
                        fontSize: '7cqi',
                        lineHeight: '8cqi',
                        color: VERM_INK,
                      }}
                    >
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {/* 8 */}
            <div className="b b8">
              <div
                className="mini-card c"
                style={{ left: '36cqi', top: '8cqi', transform: 'rotate(-5deg)' }}
              >
                <img src="/insignar/card-front.svg" alt="" />
              </div>
              <div
                className="abs bleed"
                style={{ left: 0, top: 0, width: '100cqi', height: '34cqi', background: VERM }}
              />
              <p
                className="abs gone big"
                style={{
                  left: 0,
                  right: 0,
                  top: '7cqi',
                  textAlign: 'center',
                  fontSize: '17cqi',
                  color: '#121211',
                }}
              >
                Gone
              </p>
            </div>
            {/* 9 */}
            <div className="b b9">
              <span
                className="dot"
                style={{ left: '48.5cqi', top: '17cqi', width: '3cqi', height: '3cqi' }}
              />
            </div>
            {/* 10 */}
            <div className="b b10">
              <Dots />
              <div className="mini-card c" style={{ left: '36cqi', top: '8cqi' }}>
                <img src="/insignar/card-front.svg" alt="" />
              </div>
              <span
                className="chip"
                style={{
                  position: 'absolute',
                  left: '45.5cqi',
                  top: '29cqi',
                  color: '#ece9e2',
                  borderColor: '#6d6a62',
                  margin: 0,
                }}
              >
                Card {U.cardNo}
              </span>
              <div className="abs fill" style={{ inset: 0, background: VERM }} />
            </div>
            {/* 11 */}
            <div className="b b11">
              <div className="abs" style={{ left: '6cqi', top: '8cqi', width: '42cqi' }}>
                <p
                  style={{
                    fontFamily: 'var(--f-mono)',
                    fontSize: '1.3cqi',
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: '#a8a49c',
                  }}
                >
                  {U.voice}
                </p>
                <div className="wave" style={{ marginTop: '2cqi', height: '14cqi' }}>
                  {WAVE.map((_, i) => (
                    <i key={i} />
                  ))}
                </div>
              </div>
              <div
                className="pnl pg11"
                style={{ left: '54cqi', top: '5cqi', width: '40cqi', height: '27cqi' }}
              >
                <p className="m lock">{U.pageTitle}</p>
                <p
                  className="t"
                  style={{ fontSize: '3.4cqi', marginTop: '1.2cqi', lineHeight: 1.12 }}
                >
                  “
                  {QUOTE.map((w, i) => (
                    <span
                      key={w}
                      className={`qw${i}`}
                      style={{ display: 'inline-block', marginRight: '0.7cqi' }}
                    >
                      {w}
                    </span>
                  ))}
                  ”
                </p>
                <div className="bar" style={{ width: '70%' }} />
                <div className="bar" style={{ width: '45%' }} />
              </div>
            </div>
            {/* 12 */}
            <div className="b b12 lt">
              <div
                className="pnl cost"
                style={{ left: '8cqi', top: '4cqi', width: '84cqi', height: '30cqi' }}
              >
                <p className="m">
                  {U.costTitle}{' '}
                  <span className="tag ex" style={{ fontSize: '1.2cqi' }}>
                    EXAMPLE
                  </span>
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '1.4cqi',
                    marginTop: '1.4cqi',
                    fontFamily: 'var(--f-display)',
                    fontSize: '6cqi',
                    letterSpacing: '-0.02em',
                    lineHeight: '7cqi',
                  }}
                >
                  <span className="reel">
                    <span className="rl rl0">
                      {LOW.map((v) => (
                        <b key={v}>{v}</b>
                      ))}
                    </span>
                  </span>
                  <span className="rest" style={{ fontWeight: 700 }}>
                    to
                  </span>
                  <span className="reel">
                    <span className="rl rl1">
                      {HIGH.map((v) => (
                        <b key={v}>{v}</b>
                      ))}
                    </span>
                  </span>
                  <span className="rest" style={{ fontWeight: 700 }}>
                    a year
                  </span>
                </div>
                <div className="range">
                  <i />
                </div>
                <p>
                  {U.costSources.map((s) => (
                    <span key={s} className="chip src">
                      {s}
                    </span>
                  ))}
                  <span
                    className="chip okc"
                    style={{ color: 'var(--verm-ink)', borderColor: 'var(--verm-ink)' }}
                  >
                    ✓ {U.confirmed}
                  </span>
                </p>
              </div>
            </div>
            {/* 13 */}
            <div className="b b13">
              <div
                className="pnl case"
                style={{ left: '6cqi', top: '4cqi', width: '44cqi', height: '30cqi' }}
              >
                <p className="m">{U.team}</p>
                <p className="t" style={{ fontSize: '3.2cqi', marginTop: '1.4cqi' }}>
                  {U.teamBody}
                </p>
                <div className="bar" style={{ width: '65%' }} />
              </div>
              <div
                className="pnl steps"
                style={{ left: '54cqi', top: '4cqi', width: '40cqi', height: '30cqi' }}
              >
                <p className="m">3 steps</p>
                {U.howSteps.map((s, d) => (
                  <p key={s} className={`chk ck${d}`}>
                    <i>
                      <b style={{ transform: 'scale(0)' }} />
                      <u style={{ opacity: 0 }} />
                    </i>
                    {s}
                  </p>
                ))}
              </div>
            </div>
            {/* 14 */}
            <div className="b b14">
              <div
                className="abs zm"
                style={{ left: '26cqi', top: '3cqi', width: '48cqi', transformOrigin: '33% 50%' }}
              >
                <div className="mini-card" style={{ position: 'relative', width: '100%' }}>
                  <img src="/insignar/card-back.svg" alt="" />
                </div>
                {[0, 1].map((i) => (
                  <span
                    key={i}
                    className="ringc"
                    style={{
                      left: `${33 - 12}%`,
                      top: '50%',
                      width: '24%',
                      aspectRatio: '1',
                      marginTop: '-12%',
                    }}
                  />
                ))}
              </div>
              <Phone cls="ph" style={{ left: '40.5cqi', top: '2cqi', opacity: 0 }} />
            </div>
            {/* 15 */}
            <div className="b b15">
              <Dots />
              <div className="abs zm" style={{ left: '12cqi', top: '9cqi', width: '36cqi' }}>
                <div className="mini-card" style={{ position: 'relative', width: '100%' }}>
                  <img src="/insignar/card-back.svg" alt="" />
                </div>
              </div>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="ringc"
                  style={{
                    left: '21.9cqi',
                    top: '19cqi',
                    width: '4cqi',
                    height: '4cqi',
                    marginLeft: 0,
                  }}
                />
              ))}
              <Phone cls="ph" style={{ left: '34cqi', top: '2cqi' }} />
            </div>
            {/* 16 */}
            <div className="b b16 lt">
              <div
                className="pnl pgv"
                style={{
                  left: '28cqi',
                  top: '3cqi',
                  width: '44cqi',
                  height: '33cqi',
                  padding: 0,
                  overflow: 'hidden',
                }}
              >
                <div className="pgi" style={{ padding: '2cqi 2.4cqi' }}>
                  <p className="m">{U.pageTitle}</p>
                  <p className="t" style={{ fontSize: '3.4cqi', marginTop: '1cqi' }}>
                    “Tickets double after every release.”
                  </p>
                  <div className="bar" style={{ width: '80%' }} />
                  <div className="bar" style={{ width: '60%' }} />
                  <p className="m" style={{ marginTop: '2.4cqi' }}>
                    {U.team}
                  </p>
                  <p style={{ fontSize: '2cqi', color: '#34332f', marginTop: '0.8cqi' }}>
                    {U.teamBody}
                  </p>
                  <div className="bar" style={{ width: '70%' }} />
                  {U.howSteps.map((s) => (
                    <p key={s} style={{ fontSize: '2cqi', color: '#34332f', marginTop: '1cqi' }}>
                      {s}
                    </p>
                  ))}
                  <p
                    className="rmv"
                    style={{
                      fontSize: '2cqi',
                      textDecoration: 'underline',
                      marginTop: '3cqi',
                      color: VERM_INK,
                      width: 'fit-content',
                    }}
                  >
                    {U.remove}
                  </p>
                  <p style={{ fontSize: '1.6cqi', color: '#65625c', marginTop: '0.8cqi' }}>
                    Forward to your team{' '}
                    <span className="tag ex" style={{ fontSize: '1.1cqi' }}>
                      {U.concept}
                    </span>
                  </p>
                </div>
              </div>
              <div
                className="chip read"
                style={{
                  position: 'absolute',
                  left: '75cqi',
                  top: '6cqi',
                  margin: 0,
                  color: VERM_INK,
                  borderColor: VERM_INK,
                  background: '#f8f7f3',
                  fontSize: '1.8cqi',
                  padding: '0.6cqi 1.6cqi',
                }}
              >
                Read{' '}
                <span
                  style={{
                    position: 'relative',
                    display: 'inline-block',
                    width: '2.6cqi',
                    height: '1.2em',
                    verticalAlign: 'bottom',
                  }}
                >
                  <span className="r1" style={{ position: 'absolute', left: 0 }}>
                    ×1
                  </span>
                  <span className="r2" style={{ position: 'absolute', left: 0, opacity: 0 }}>
                    ×2
                  </span>
                </span>
              </div>
            </div>
            {/* 17 */}
            <div className="b b17">
              <div className="pnl slotp" style={{ left: '8cqi', top: '4cqi', width: '44cqi' }}>
                <p className="m">Thursday</p>
                <div className="slots" style={{ marginTop: '1.4cqi' }}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <i key={i} className={i === 6 ? 'pick' : undefined} />
                  ))}
                </div>
              </div>
              <div className="pnl meet" style={{ left: '58cqi', top: '4cqi', width: '34cqi' }}>
                <p className="m">
                  <span className="tag ex" style={{ fontSize: '1.1cqi' }}>
                    EXAMPLE
                  </span>
                </p>
                <p className="t" style={{ marginTop: '1cqi', fontSize: '2.8cqi' }}>
                  {U.meeting}
                </p>
                <p style={{ fontSize: '1.8cqi', color: '#34332f', marginTop: '0.8cqi' }}>
                  {U.meetingWho}
                </p>
                <p style={{ fontSize: '1.5cqi', color: '#65625c', marginTop: '1.2cqi' }}>
                  {U.group}{' '}
                  <span className="tag ex" style={{ fontSize: '1.1cqi' }}>
                    {U.concept}
                  </span>
                </p>
              </div>
            </div>
            {/* 18 */}
            <div className="b b18">
              <div className="five" style={{ left: '28.5cqi', top: '14cqi' }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i}>
                    <i style={{ transform: 'scale(0)' }} />
                  </span>
                ))}
              </div>
            </div>
            {/* 19 */}
            <div className="b b19">
              <img
                className="mk abs"
                src="/brand/insignar-mark-white.png"
                alt=""
                style={{ left: '46cqi', top: '4cqi', width: '8cqi' }}
              />
              <span
                className="btn cta2 abs"
                style={{
                  left: '50%',
                  top: '22cqi',
                  transform: 'translateX(-50%)',
                  fontSize: '2cqi',
                  minHeight: '5.6cqi',
                  padding: '0 3cqi',
                  background: '#f2491c',
                  color: '#121211',
                  borderColor: '#f2491c',
                  whiteSpace: 'nowrap',
                }}
              >
                Request a pilot
              </span>
            </div>
          </div>
        </div>

        {/* captions: always on, karaoke, never shaken */}
        <div className="kcs" aria-hidden="true">
          {B.map((b, i) =>
            b.line ? (
              <p
                key={b.t}
                className={`kc kc${i + 1}${LIGHT.has(i + 1) ? 'lt' : ''}${i === B.length - 1 ? 'end' : ''}`}
              >
                {b.line.split(' ').map((w, j) => (
                  <span key={j} className="w">
                    {w}
                  </span>
                ))}
              </p>
            ) : null,
          )}
        </div>
      </div>

      <div className="film-bar">
        <button type="button" className="btn" onClick={toggle}>
          {ended ? film.replay : playing ? film.pause : film.play}
        </button>
        <div className="prog" aria-hidden="true">
          <i />
        </div>
        <button type="button" className="btn ghost" onClick={toggleSound}>
          {sound ? film.soundOff : film.soundOn}
        </button>
      </div>
      <p className="note">{film.note}</p>

      <h3 className="fig" style={{ marginTop: 22 }}>
        {film.transcript}
      </h3>
      <ol className="transcript">
        {B.map((b) => (
          <li key={b.t + b.start}>
            <time>{b.t}</time>
            <span>{b.line || film.silence}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Film() {
  const reduce = useSyncExternalStore(subscribeReduce, getReduce, () => false);
  return reduce ? <FilmCalm /> : <FilmFast />;
}
