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
const QUOTE = ['Tickets', 'double', 'after', 'every', 'release.'];
/** Solution part (17-41 s) sits on the light canvas (#EFEEEA, ink type) via the .lt class; the problem part and end card stay dark. */
const SNAP = 17.6;
const SNAP_BEAT = 10;
const END = 19;
const INK = '#121211';
const SLOTS = [
  '09:00',
  '09:20',
  '09:40',
  '10:00',
  '10:20',
  '10:40',
  '11:00',
  '11:20',
  '11:40',
  '12:00',
  '12:20',
  '12:40',
];
const WHIP = new Set([2, 5, 11, 13, 16]);
const VERM = '#F2491C';
const VERM_INK = '#C8350F';
const SILENT_FROM = 15;
const SILENT_TO = 16.6;
/** One voice clip per beat, started at the beat time on the master timeline. Missing files stay silent. */
type VoClip = { readonly at: number; readonly src: string };
const VO: readonly VoClip[] = [
  { at: 0, src: '/insignar/vo/line-01.mp3' },
  { at: 1.2, src: '/insignar/vo/line-02.mp3' },
  { at: 2.6, src: '/insignar/vo/line-03.mp3' },
  { at: 4, src: '/insignar/vo/line-04.mp3' },
  { at: 6, src: '/insignar/vo/line-05.mp3' },
  { at: 8, src: '/insignar/vo/line-06.mp3' },
  { at: 10.5, src: '/insignar/vo/line-07.mp3' },
  { at: 12.5, src: '/insignar/vo/line-08.mp3' },
  { at: 15, src: '/insignar/vo/line-09.mp3' },
  { at: 16.6, src: '/insignar/vo/line-10.mp3' },
  { at: 19, src: '/insignar/vo/line-11.mp3' },
  { at: 22, src: '/insignar/vo/line-12.mp3' },
  { at: 25.5, src: '/insignar/vo/line-13.mp3' },
  { at: 29, src: '/insignar/vo/line-14.mp3' },
  { at: 32, src: '/insignar/vo/line-15.mp3' },
  { at: 34.5, src: '/insignar/vo/line-16.mp3' },
  { at: 37.5, src: '/insignar/vo/line-17.mp3' },
  { at: 40.5, src: '/insignar/vo/line-18.mp3' },
  { at: 42.5, src: '/insignar/vo/line-19.mp3' },
];

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
          <b>{U.email[0]}</b>
          <span>{U.email[2]}</span>
        </div>
      ))}
    </>
  );
}

function Illustrative({ size = '1.1cqi' }: { size?: string }) {
  return (
    <span className="tag ex" style={{ fontSize: size, marginLeft: '0.8cqi' }}>
      {U.illustrative}
    </span>
  );
}

function Phone({ cls, style }: { cls: string; style: React.CSSProperties }) {
  return (
    <div className={`pnl ph ${cls}`} style={style}>
      <p className="m">
        {U.pageTitle}
        <Illustrative size="0.8cqi" />
      </p>
      <p className="t" style={{ marginTop: '0.8cqi' }}>
        “Tickets double after every release.”
      </p>
      <p style={{ fontSize: '1.2cqi', color: '#34332f', marginTop: '1.6cqi' }}>{U.teamBody}</p>
    </div>
  );
}

function FilmFast() {
  const root = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const api = useRef<{ go: () => void; halt: () => void; sync: () => void }>(null);
  const clips = useRef<Map<string, HTMLAudioElement | null>>(new Map());
  const live = useRef<Set<HTMLAudioElement>>(new Set());
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
      const shk = box.querySelector('.shk');
      const pls = q('.pulse');
      /** Voice: pause or drop every running clip (drop clears the resume list). */
      const stopClips = (drop: boolean) => {
        live.current.forEach((a) => a.pause());
        if (drop) live.current.clear();
      };
      const playClip = (src: string) => {
        if (!sfx.on) return;
        const a = clips.current.get(src);
        if (!a) return;
        a.currentTime = 0;
        live.current.add(a);
        a.onended = () => live.current.delete(a);
        a.play().catch(() => {});
      };
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
        },
        onComplete: () => {
          box.dataset.play = 'off';
          stopClips(true);
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
      /** 2-frame camera shake (at 30 fps), amplitude in px, on an impact only. */
      const shake = (t: number, px: number) => {
        tl.set(shk, { x: px, y: -px * 0.7 }, t);
        tl.set(shk, { x: -px * 0.8, y: px * 0.6 }, t + 0.033);
        tl.set(shk, { x: 0, y: 0 }, t + 0.066);
      };
      /** Energy device: brightness +4% on a hit, decaying over 0.2 s. */
      const pulse = (t: number) => {
        tl.set(pls, { opacity: 0.04 }, t);
        tl.to(pls, { opacity: 0, duration: 0.2, ease: 'none' }, t);
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
      const sc = (n: number) => q(`.b${n}`);
      const k = (n: number, sel: string) => q(`.b${n} ${sel}`);

      /* ---------- scene visibility and whips ---------- */
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
        } else if (n === END) {
          // dark closing band: 0.15 s fade, never a hard luminance swap
          tl.fromTo(
            node,
            { autoAlpha: 0 },
            { autoAlpha: 1, duration: 0.15, ease: 'none' },
            b.start,
          );
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
        } else if (n + 1 === END) {
          tl.to(node, { autoAlpha: 0, duration: 0.15, ease: 'none' }, b.end - 0.15);
        } else {
          tl.set(node, { autoAlpha: 0 }, b.end);
        }
      });

      /* ---------- 1 · 0.0 "You met him." the card hit (loud 1) ---------- */
      tl.fromTo(
        k(1, '.c'),
        { scale: 2.6, rotate: 14, opacity: 0 },
        { scale: 1, rotate: -5, opacity: 1, duration: 0.17, ease: 'power4.in' },
        0.02,
      );
      tl.fromTo(k(1, '.chip'), { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'none' }, 0.5);
      fx('hit', 0.17);
      shake(0.19, 8);
      pulse(0.19);

      /* ---------- 2 · 1.2 "Great conversation." quote bubble ---------- */
      tl.fromTo(
        k(2, '.bub'),
        { scale: 0.55, y: 30, opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' },
        1.3,
      );
      tl.set(k(2, '.hl'), { color: VERM_INK }, 2.0);
      fx('tick', 1.45);
      fx('tick', 2.0, { pitch: 1.3 });

      /* ---------- 3 · 2.6 "Six more. Fast." six cards fan out ---------- */
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
      fx('thock', 2.62);
      ticks(2.72, 6, 0.1, 1, 1.5);

      /* ---------- 4 · 4.0 "By Thursday, they’re a name on your list." calendar flips Mon to Thu ---------- */
      tl.fromTo(k(4, '.cal'), { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'none' }, 4.0);
      [0, 1, 2, 3].forEach((d, i) => {
        tl.set(k(4, '.hlc'), { xPercent: d * 100, opacity: 1 }, 4.1 + i * 0.1);
        if (d < 3) tl.set(k(4, `.col${d}`), { opacity: 0.3 }, 4.2 + i * 0.1);
        fx('tick', 4.1 + i * 0.1, { pitch: 0.8 + i * 0.15 });
      });
      tl.fromTo(
        k(4, '.thu'),
        { opacity: 0, scale: 0.6 },
        { opacity: 1, scale: 1, duration: 0.3, ease: 'power3.out' },
        4.5,
      );
      fx('thock', 4.5);

      /* ---------- 5 · 6.0 "Gone." notes delete, the quote dissolves into dots ---------- */
      tl.fromTo(k(5, '.notes'), { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'none' }, 6.05);
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
      tl.to(k(5, '.nq'), { opacity: 0, duration: 0.16, ease: 'none' }, 7.0);
      tl.fromTo(k(5, '.fd'), { opacity: 0, yPercent: 0 }, { opacity: 1, duration: 0.01 }, 7.0);
      fromToLate(
        k(5, '.fd'),
        { yPercent: 0 },
        { yPercent: 3200, duration: 0.7, stagger: 0.035, ease: 'power2.in' },
        7.05,
      );
      tl.to(k(5, '.fd'), { opacity: 0, duration: 0.15, stagger: 0.035 }, 7.65);
      tl.to(k(5, '.notes'), { opacity: 0.2, duration: 0.3, ease: 'none' }, 7.2);
      fx('rwhoosh', 6.0);
      ticks(6.3, 4, 0.2, 1.2, 0.8);

      /* ---------- 6 · 8.0 inbox flood: one layer (12 rows, expo.out, under 0.8 s) plus one hit ---------- */
      tl.fromTo(
        k(6, '.erow'),
        { y: c(5), opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, ease: 'expo.out', stagger: 0.03 },
        8.0,
      );
      fx('hit', 8.45);
      // tick rate ramps up through 8-12 s, then stops (hard cut at 15 s)
      {
        let at = 8.0;
        let gap = 0.24;
        let i = 0;
        while (at < 12) {
          fx('tick', at, { pitch: 0.9 + Math.min(1.3, i * 0.04) });
          at += gap;
          gap = Math.max(0.07, gap * 0.93);
          i++;
        }
      }

      /* ---------- 7 · 10.5 "Unopened." the unread counter punches (dark beat) ---------- */
      tl.fromTo(k(7, '.big7'), { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'none' }, 10.5);
      tl.to(k(7, '.big7'), { opacity: 0.35, duration: 0.3, ease: 'none' }, 11.0);
      tl.fromTo(
        k(7, '.unread'),
        { opacity: 0 },
        { opacity: 1, duration: 0.15, ease: 'none' },
        10.5,
      );
      [0, 1, 2].forEach((d) => {
        const at = 10.55 + d * 0.4;
        tl.set(k(7, `.n${d}`), { opacity: 1 }, at);
        if (d > 0) tl.set(k(7, `.n${d - 1}`), { opacity: 0 }, at);
        fromToLate(
          k(7, `.n${d}`),
          { scale: 1.3 },
          { scale: 1, duration: 0.15, ease: 'power4.out' },
          at,
        );
        fx('thock', at, { pitch: 0.7 + d * 0.15 });
      });
      fx('riser', 10.55, { dur: 4.45 });
      tl.call(() => sfx.cut(), [], SILENT_FROM);

      /* ---------- 8 · 12.5 "The deal walks." card exit, impact, "Gone" (loud 2) ---------- */
      tl.fromTo(
        k(8, '.c'),
        { x: 0, skewX: 0, rotate: -5, opacity: 1 },
        { x: c(110), skewX: 14, duration: 0.45, ease: 'power4.in' },
        12.6,
      );
      tl.fromTo(
        k(8, '.bleed'),
        { scaleX: 0 },
        { scaleX: 1, duration: 0.5, ease: 'power4.out', transformOrigin: 'left center' },
        12.9,
      );
      tl.fromTo(
        k(8, '.gone'),
        { scale: 1.4, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.2, ease: 'power4.out' },
        13.42,
      );
      fx('hit', 13.42);
      shake(13.42, 14);
      pulse(13.42);
      tl.to(k(8, '.bleed, .gone'), { opacity: 0, duration: 0.3, ease: 'none' }, 14.22);

      /* ---------- 9 · 15.0 silence, one dot (the turn, loud 3), zoom through it ---------- */
      tl.fromTo(
        k(9, '.dot'),
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.2)' },
        15.3,
      );
      pulse(15.8);
      tl.to(k(9, '.dot'), { scale: 90, duration: 0.3, ease: 'expo.in' }, 16.3);

      /* ---------- 10 · 16.6 "Not this time." the dot ripples into the grid, hard snap to light at 17.6 ---------- */
      tl.fromTo(
        k(10, '.fill'),
        { opacity: 1 },
        { opacity: 0, duration: 0.35, ease: 'power2.out' },
        16.6,
      );
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
      tl.fromTo(
        k(10, '.c'),
        { scale: 1.5, rotate: 8, opacity: 0 },
        { scale: 1, rotate: -5, opacity: 1, duration: 0.3, ease: 'power2.out' },
        17.2,
      );
      tl.fromTo(k(10, '.lbg'), { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'none' }, 17.6);
      tl.fromTo(k(10, '.chip'), { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'none' }, 17.6);
      tl.set(q('.kc10'), { textShadow: 'none', color: INK }, SNAP);
      fx('tick', 16.6, { pitch: 0.7 });
      fx('thock', 17.6);
      shake(SNAP, 3);
      pulse(SNAP);

      /* ---------- 11 · 19.0 "One minute. Their words." words lock into the page ---------- */
      tl.fromTo(
        k(11, '.wave i'),
        { scaleY: 0.1 },
        {
          scaleY: (i: number) => WAVE[i % WAVE.length] ?? 0.5,
          duration: 0.3,
          stagger: 0.018,
          ease: 'expo.out',
        },
        19.1,
      );
      tl.fromTo(k(11, '.pg11'), { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'none' }, 19.5);
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
      fx('thock', 21.7);

      /* ---------- 12 · 22.0 "What it costs their company." the figure locks, source line held 3 s ---------- */
      tl.fromTo(k(12, '.cost'), { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'none' }, 22.0);
      fromToLate(
        k(12, '.cfig'),
        { scale: 1.15, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.2)' },
        22.1,
      );
      tl.fromTo(k(12, '.srcln'), { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'none' }, 22.5);
      tl.fromTo(k(12, '.okc'), { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'none' }, 24.0);
      fx('thock', 22.1);

      /* ---------- 13 · 25.5 "A team like theirs that fixed it." case card, three steps ---------- */
      tl.fromTo(
        k(13, '.case'),
        { x: c(60), opacity: 0 },
        { x: 0, opacity: 1, duration: 0.45, ease: 'expo.out' },
        25.6,
      );
      tl.fromTo(k(13, '.steps'), { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'none' }, 26.2);
      [0, 1, 2].forEach((d) => {
        const at = 27.0 + d * 0.45;
        tl.fromTo(
          k(13, `.ck${d} b`),
          { scale: 0 },
          { scale: 1, duration: 0.22, ease: 'expo.out' },
          at,
        );
        tl.fromTo(k(13, `.ck${d} u`), { opacity: 0 }, { opacity: 1, duration: 0.05 }, at + 0.1);
        fx('tick', at, { pitch: 1 + d * 0.25 });
      });

      /* ---------- 14 · 29.0 "One page. About him." zoom through the tap point into the page ---------- */
      tl.fromTo(
        k(14, '.zm'),
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.3, ease: 'power3.out' },
        29.0,
      );
      fromToLate(
        k(14, '.zm'),
        { scale: 1 },
        { scale: 16, duration: 0.85, ease: 'power3.in' },
        30.0,
      );
      tl.to(k(14, '.zm'), { opacity: 0, duration: 0.1, ease: 'none' }, 30.8);
      tl.fromTo(
        k(14, '.ph'),
        { scale: 0.15, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.55, ease: 'power3.out' },
        30.75,
      );
      fx('whoosh', 30.0);
      fx('thock', 30.8);

      /* ---------- 15 · 32.0 "They tap." the ripple fills the screen ---------- */
      tl.fromTo(k(15, '.zm'), { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'none' }, 32.0);
      tl.fromTo(
        k(15, '.ph'),
        { x: c(38), y: c(8), opacity: 0 },
        { x: 0, y: 0, opacity: 1, duration: 0.55, ease: 'power3.inOut' },
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
      fx('thock', 33.0);

      /* ---------- 16 · 34.5 "They read it. Twice." one 0.7 s scroll; "Remove my details" stays put ---------- */
      tl.fromTo(k(16, '.pgv'), { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'none' }, 34.5);
      tl.fromTo(k(16, '.pgi'), { y: 0 }, { y: c(-5), duration: 0.7, ease: 'power2.inOut' }, 34.9);
      tl.fromTo(
        k(16, '.read'),
        { scale: 0.5, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.3, ease: 'power2.out' },
        34.8,
      );
      tl.set(k(16, '.r1'), { opacity: 0 }, 36.0);
      tl.set(k(16, '.r2'), { opacity: 1 }, 36.0);
      fromToLate(
        k(16, '.r2'),
        { scale: 1.5 },
        { scale: 1, duration: 0.3, ease: 'power2.out' },
        36.0,
      );
      fx('rwhoosh', 34.45, { pitch: 1.3 });
      fx('tick', 36.0, { pitch: 1.4 });

      /* ---------- 17 · 37.5 "Booked." the slot slams in ---------- */
      tl.fromTo(
        k(17, '.slots i'),
        { opacity: 0 },
        { opacity: 1, duration: 0.2, ease: 'none', stagger: 0.02 },
        37.5,
      );
      tl.fromTo(
        k(17, '.pick'),
        { scale: 3.4, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.14, ease: 'power4.in' },
        37.7,
      );
      tl.fromTo(k(17, '.meet'), { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'none' }, 38.1);
      fx('deep', 37.84);

      /* ---------- 18 · 40.5 "Be the one they remember." five dots light one by one ---------- */
      tl.fromTo(
        k(18, '.five span'),
        { opacity: 0 },
        { opacity: 1, duration: 0.2, ease: 'none' },
        40.5,
      );
      tl.fromTo(
        k(18, '.five span i'),
        { scale: 0 },
        { scale: 1, duration: 0.25, ease: 'back.out(1.7)', stagger: 0.32 },
        40.8,
      );
      ticks(40.8, 5, 0.32, 0.9, 1.5);

      /* ---------- 19 · 42.5 end card (quiet, held 3 s) ---------- */
      tl.fromTo(k(19, '.mk'), { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'none' }, 42.55);
      tl.fromTo(k(19, '.cta2'), { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'none' }, 42.9);
      fx('thock', 42.6, { pitch: 0.8 });
      tl.to({}, { duration: 0.01 }, DURATION - 0.01);

      /* ---------- voice: one clip per line, started by the timeline, only when sound is on ---------- */
      VO.forEach((v) => tl.call(() => playClip(v.src), [], v.at));

      /* ---------- karaoke captions: one key word per line, vermilion underline wipe ---------- */
      B.forEach((b, i) => {
        if (!b.line) return;
        const n = i + 1;
        const lightAt = (t: number) => n > SNAP_BEAT || (n === SNAP_BEAT && t >= SNAP);
        const ws = q(`.kc${n} .w`);
        const uls = q(`.kc${n} .ul`);
        const words = b.line.split(' ');
        const key = b.key[0];
        const win = b.end - b.start - 0.3;
        const want = 0.28 * words.length + 0.04 * b.line.length;
        const total = Math.min(win, want);
        const wsum = words.reduce((a, w) => a + w.length + 2, 0);
        let t = b.start + 0.08;
        if (n === SNAP_BEAT) tl.set(ws, { color: INK }, SNAP + 0.001);
        tl.set(q(`.kc${n}`), { autoAlpha: 1 }, b.start);
        tl.set(q(`.kc${n}`), { autoAlpha: 0 }, b.end);
        words.forEach((w, j) => {
          const dur = (total * (w.length + 2)) / wsum;
          const word = ws[j];
          if (!word) return;
          const accAt = lightAt(t) ? VERM_INK : VERM;
          tl.set(word, { opacity: 1, color: accAt }, t);
          if (key === j) {
            fromToLate(word, { scale: 1.15 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' }, t);
            const ul = uls[0];
            if (ul)
              fromToLate(ul, { scaleX: 0 }, { scaleX: 1, duration: 0.25, ease: 'power3.out' }, t);
          }
          const te = t + (j < words.length - 1 ? dur : 0.45);
          tl.set(word, { color: lightAt(te) ? INK : '#ffffff' }, te);
          t += dur;
        });
      });

      /* ---------- player ---------- */
      const go = () => {
        box.dataset.play = 'on';
        tl.play();
        setPlaying(true);
        if (sfx.on) live.current.forEach((a) => a.play().catch(() => {}));
      };
      const halt = () => {
        box.dataset.play = 'off';
        tl.pause();
        sfx.cut();
        stopClips(false);
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
        stopClips(true);
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
      live.current.forEach((a) => a.pause());
      live.current.clear();
      setSound(false);
      return;
    }
    sfx.unlock();
    sfx.play('tick');
    setSound(true);
    // One clip per line. Files that are missing or fail to load are dropped silently.
    VO.forEach((v) => {
      if (clips.current.has(v.src)) return;
      const a = new Audio(v.src);
      a.preload = 'auto';
      clips.current.set(v.src, a);
      a.addEventListener('error', () => clips.current.set(v.src, null));
    });
  };

  return (
    <div ref={root}>
      <div
        className="film-box f6"
        data-play="off"
        role="img"
        aria-label={`${film.title} ${film.note}`}
      >
        <div className="shk">
          <div className="cam">
            {/* 1 */}
            <div className="b b1">
              <div className="mini-card c" style={{ left: '36cqi', top: '7cqi' }}>
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
            </div>
            {/* 2 */}
            <div className="b b2">
              <div className="pnl bub" style={{ left: '18cqi', top: '6cqi', width: '64cqi' }}>
                <p className="m" style={{ marginBottom: '1.2cqi' }}>
                  Heard at the event
                  <Illustrative size="1.2cqi" />
                </p>
                <p className="t" style={{ fontSize: '5.4cqi', lineHeight: 1.05 }}>
                  “Tickets{' '}
                  <span className="hl" style={{ display: 'inline-block' }}>
                    double
                  </span>
                </p>
                <p className="t" style={{ fontSize: '5.4cqi', lineHeight: 1.05 }}>
                  after every release.”
                </p>
                <p className="m" style={{ marginTop: '1.6cqi', color: '#65625c' }}>
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
                <p className="m">
                  Notes · event
                  <Illustrative size="1.1cqi" />
                </p>
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
                  Email everyone this week
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
            <div className="b b6">
              <div className="inbox" style={{ left: '6cqi', top: '3cqi', width: '88cqi' }}>
                <Rows n={12} />
              </div>
            </div>
            {/* 7 */}
            <div className="b b7">
              <div
                className="pnl big7"
                style={{ left: '8cqi', top: '12cqi', width: '58cqi', padding: '2cqi 2.4cqi' }}
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
                style={{ left: '70cqi', top: '12cqi', width: '22cqi', textAlign: 'center' }}
              >
                <p className="m">
                  Unread
                  <span className="tag ex" style={{ fontSize: '1cqi', marginLeft: '0.6cqi' }}>
                    EXAMPLE
                  </span>
                </p>
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
              <div className="abs lbg" style={{ inset: 0, background: '#efeeea', opacity: 0 }} />
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
                  color: INK,
                  borderColor: '#8c887e',
                  margin: 0,
                  opacity: 0,
                }}
              >
                Card {U.cardNo}
              </span>
              <div className="abs fill" style={{ inset: 0, background: VERM }} />
            </div>
            {/* 11 */}
            <div className="b b11 lt">
              <div className="abs" style={{ left: '6cqi', top: '8cqi', width: '42cqi' }}>
                <p
                  style={{
                    fontFamily: 'var(--f-mono)',
                    fontSize: '1.3cqi',
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: '#65625c',
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
              <div className="pnl pg11" style={{ left: '54cqi', top: '5cqi', width: '40cqi' }}>
                <p className="m lock">
                  {U.pageTitle}
                  <Illustrative />
                </p>
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
              </div>
            </div>
            {/* 12 */}
            <div className="b b12 lt">
              <div className="pnl cost" style={{ left: '8cqi', top: '4cqi', width: '84cqi' }}>
                <p className="m">
                  {U.costTitle}{' '}
                  <span className="tag ex" style={{ fontSize: '1.2cqi' }}>
                    EXAMPLE
                  </span>
                </p>
                <p
                  className="cfig"
                  style={{
                    marginTop: '2cqi',
                    fontFamily: 'var(--f-display)',
                    fontWeight: 800,
                    fontSize: '9cqi',
                    letterSpacing: '-0.035em',
                    lineHeight: 1,
                  }}
                >
                  {U.costRange}
                </p>
                <p
                  className="srcln"
                  style={{
                    marginTop: '2.4cqi',
                    fontFamily: 'var(--f-mono)',
                    fontSize: '1.5cqi',
                    letterSpacing: '0.04em',
                    color: '#34332f',
                  }}
                >
                  {U.costSourceLine}
                </p>
                <p style={{ marginTop: '1.6cqi' }}>
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
            <div className="b b13 lt">
              <div className="pnl case" style={{ left: '6cqi', top: '4cqi', width: '44cqi' }}>
                <p className="m">
                  {U.team}
                  <span className="tag ex" style={{ fontSize: '1cqi', marginLeft: '0.6cqi' }}>
                    EXAMPLE
                  </span>
                </p>
                <p className="t" style={{ fontSize: '3.2cqi', marginTop: '1.4cqi' }}>
                  {U.teamBody}
                </p>
              </div>
              <div className="pnl steps" style={{ left: '54cqi', top: '4cqi', width: '40cqi' }}>
                <p className="m">Steps</p>
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
            <div className="b b14 lt">
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
            <div className="b b15 lt">
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
                  <p className="m">
                    {U.pageTitle}
                    <Illustrative />
                  </p>
                  <p className="t" style={{ fontSize: '3.4cqi', marginTop: '1cqi' }}>
                    “Tickets double after every release.”
                  </p>
                  <p className="m" style={{ marginTop: '2.4cqi' }}>
                    {U.team}
                  </p>
                  <p style={{ fontSize: '2cqi', color: '#34332f', marginTop: '0.8cqi' }}>
                    {U.teamBody}
                  </p>
                  {U.howSteps.map((s) => (
                    <p key={s} style={{ fontSize: '2cqi', color: '#34332f', marginTop: '1cqi' }}>
                      {s}
                    </p>
                  ))}
                  <p style={{ fontSize: '1.6cqi', color: '#65625c', marginTop: '0.8cqi' }}>
                    Forward to your team{' '}
                    <span className="tag ex" style={{ fontSize: '1.1cqi' }}>
                      {U.concept}
                    </span>
                  </p>
                </div>
                <div
                  className="rmv"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    padding: '1.4cqi 2.4cqi',
                    background: '#f8f7f3',
                    borderTop: '1px solid var(--line)',
                    fontSize: '2cqi',
                    textDecoration: 'underline',
                    color: VERM_INK,
                  }}
                >
                  {U.remove}
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
                <span className="tag ex" style={{ fontSize: '1cqi', marginRight: '0.6cqi' }}>
                  EXAMPLE
                </span>
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
            <div className="b b17 lt">
              <div className="pnl slotp" style={{ left: '8cqi', top: '4cqi', width: '44cqi' }}>
                <p className="m">
                  Thursday
                  <span className="tag ex" style={{ fontSize: '1.1cqi', marginLeft: '0.8cqi' }}>
                    EXAMPLE
                  </span>
                </p>
                <div className="slots" style={{ marginTop: '1.4cqi' }}>
                  {SLOTS.map((t, i) => (
                    <i key={t} className={i === 3 ? 'pick' : undefined}>
                      {t}
                    </i>
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
            <div className="b b18 lt">
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
                  fontSize: 'max(14px, 2cqi)',
                  minHeight: 'max(48px, 5.6cqi)',
                  padding: '0 3cqi',
                  background: VERM_INK,
                  color: '#ffffff',
                  borderColor: VERM_INK,
                  whiteSpace: 'nowrap',
                }}
              >
                Request a pilot
              </span>
            </div>
          </div>
        </div>

        <div className="pulse" aria-hidden="true" />
        {/* captions: always on, karaoke, never shaken */}
        <div className="kcs" aria-hidden="true">
          {B.map((b, i) =>
            b.line ? (
              <p key={b.t} className={`kc kc${i + 1}${i === B.length - 1 ? 'end' : ''}`}>
                {b.line.split(' ').map((w, j) => (
                  <span key={j} className="w">
                    {w}
                    {b.key[0] === j ? <i className="ul" /> : null}
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
      <p className="note">{film.voiceNote}</p>
    </div>
  );
}

export function Film() {
  const reduce = useSyncExternalStore(subscribeReduce, getReduce, () => false);
  return reduce ? <FilmCalm /> : <FilmFast />;
}
