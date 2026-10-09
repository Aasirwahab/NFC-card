'use client';

import { useRef, useState } from 'react';
import { gsap, MQ, ScrollTrigger, useGSAP } from '@/lib/motion/gsap';
import { sfx } from '@/lib/motion/sfx';
import { film } from '@/app/(marketing)/insignar/copy';

/* eslint-disable @next/next/no-img-element */
const U = film.ui;
const WAVE = Array.from(
  { length: 44 },
  (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)),
);
const SLOTS = 12;

function Cap({ i }: { i: number }) {
  return (
    <p className="cap">
      <b>{film.scenes[i]?.line}</b>
    </p>
  );
}

export function Film() {
  const root = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const userPaused = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [sound, setSound] = useState(false);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const q = gsap.utils.selector(el);
      const mm = gsap.matchMedia();
      const bar = q('.prog i');

      const build = () => {
        const tl = gsap.timeline({
          paused: true,
          defaults: { ease: 'power3.out', duration: 0.6 },
          onUpdate: () => {
            gsap.set(bar, { scaleX: tl.progress() });
          },
          onComplete: () => {
            setPlaying(false);
            setEnded(true);
          },
        });
        const S = film.scenes;
        S.forEach((s, i) => {
          const sc = q(`.s${i + 1}`);
          tl.set(sc, { autoAlpha: 1 }, s.start);
          tl.fromTo(sc, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'none' }, s.start);
          if (i < S.length - 1) {
            tl.to(sc, { opacity: 0, duration: 0.4, ease: 'none' }, s.end - 0.4);
            tl.set(sc, { autoAlpha: 0 }, s.end);
          }
        });
        const sx = (k: 'thock' | 'tick' | 'whoosh', at: number) =>
          tl.call(() => sfx.play(k), [], at);

        // 1 the card changes hands, the quote hangs
        tl.fromTo(
          '.s1 .mini-card',
          { x: 80, y: 20, rotate: 8, opacity: 0 },
          { x: 0, y: 0, rotate: -5, opacity: 1, duration: 0.9 },
          0.2,
        );
        tl.fromTo('.s1 .q-line', { y: 30, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.12 }, 1);
        tl.fromTo('.s1 .chip', { opacity: 0 }, { opacity: 1 }, 2.2);
        sx('thock', 1);
        // 2 a generic email fills in
        tl.fromTo('.s2 .pnl', { y: 30, opacity: 0 }, { y: 0, opacity: 1 }, 5.3);
        tl.fromTo('.s2 .em', { opacity: 0, y: 8 }, { opacity: 1, y: 0, stagger: 1.1 }, 6);
        tl.fromTo('.s2 .gone', { opacity: 0 }, { opacity: 1 }, 9.2);
        sx('tick', 6);
        sx('tick', 7.1);
        sx('tick', 8.2);
        // 3 the voice note becomes the top of a page
        tl.fromTo(
          '.s3 .wave i',
          { scaleY: 0.1 },
          { scaleY: (i: number) => WAVE[i % WAVE.length] ?? 0.5, stagger: 0.03, duration: 0.5 },
          11.4,
        );
        tl.to('.s3 .wavebox', { y: -6, opacity: 0.35, duration: 0.6 }, 14);
        tl.fromTo('.s3 .page', { y: 40, opacity: 0 }, { y: 0, opacity: 1 }, 14.2);
        sx('whoosh', 14.1);
        // 4 what it costs
        tl.fromTo('.s4 .pnl', { y: 30, opacity: 0 }, { y: 0, opacity: 1 }, 17.4);
        tl.fromTo(
          '.s4 .range i',
          { scaleX: 0 },
          { scaleX: 0.68, duration: 1.4, ease: 'power2.inOut' },
          18.4,
        );
        tl.fromTo('.s4 .src', { opacity: 0, y: 8 }, { opacity: 1, y: 0, stagger: 0.5 }, 20.4);
        tl.fromTo('.s4 .tick', { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1 }, 22.6);
        sx('tick', 20.4);
        sx('tick', 22.6);
        // 5 we listened, a team like yours, three steps
        tl.fromTo(
          '.s5 .pnl',
          { y: 36, opacity: 0 },
          { y: 0, opacity: 1, stagger: 0.9, duration: 0.7 },
          25.4,
        );
        sx('thock', 25.4);
        // 6 the tap: ripple, the page opens
        tl.fromTo(
          '.s6 .ring',
          { scale: 0, opacity: 0.9 },
          { scale: 1, opacity: 0, stagger: 0.35, duration: 1.4, ease: 'power1.out' },
          32.5,
        );
        tl.fromTo('.s6 .page', { x: 40, opacity: 0 }, { x: 0, opacity: 1 }, 34);
        tl.fromTo('.s6 .rm, .s6 .fw', { opacity: 0 }, { opacity: 1, stagger: 0.4 }, 35.4);
        sx('whoosh', 32.5);
        // 7 a meeting
        tl.fromTo(
          '.s7 .slots i',
          { opacity: 0, scale: 0.8 },
          { opacity: 1, scale: 1, stagger: 0.04, duration: 0.4 },
          38.3,
        );
        tl.to('.s7 .slots i.pick', { scale: 1.12, duration: 0.3, yoyo: true, repeat: 1 }, 39.4);
        tl.fromTo('.s7 .meet', { y: 20, opacity: 0 }, { y: 0, opacity: 1 }, 39.6);
        sx('tick', 39.4);
        // 8 close
        tl.fromTo('.s8 .mk', { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1 }, 42.3);
        tl.fromTo('.s8 .big', { y: 30, opacity: 0 }, { y: 0, opacity: 1 }, 42.6);
        tl.fromTo('.s8 .cta2', { y: 16, opacity: 0 }, { y: 0, opacity: 1 }, 43.4);
        sx('thock', 42.6);
        tl.to({}, { duration: 0.01 }, 45.99);
        return tl;
      };

      mm.add(MQ.reduce, () => {
        const tl = build();
        tlRef.current = tl;
        tl.time(44.5); // final frame, static; Play is still available on request
        return () => {
          tl.kill();
        };
      });

      mm.add(MQ.ok, () => {
        const tl = build();
        tlRef.current = tl;
        const st = ScrollTrigger.create({
          trigger: el.querySelector('.film-box'),
          start: 'top 70%',
          end: 'bottom 15%',
          onEnter: () => {
            if (!userPaused.current && tl.progress() < 1) {
              tl.play();
              setPlaying(true);
            }
          },
          onEnterBack: () => {
            if (!userPaused.current && tl.progress() < 1) {
              tl.play();
              setPlaying(true);
            }
          },
          onLeave: () => {
            tl.pause();
            setPlaying(false);
          },
          onLeaveBack: () => {
            tl.pause();
            setPlaying(false);
          },
        });
        return () => {
          st.kill();
          tl.kill();
        };
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  const toggle = () => {
    const tl = tlRef.current;
    if (!tl) return;
    if (tl.progress() >= 1 || tl.time() >= 44) {
      userPaused.current = false;
      setEnded(false);
      tl.restart();
      setPlaying(true);
    } else if (tl.paused()) {
      userPaused.current = false;
      tl.play();
      setPlaying(true);
    } else {
      userPaused.current = true;
      tl.pause();
      setPlaying(false);
    }
  };

  const toggleSound = () => {
    if (sfx.on) {
      sfx.mute();
      setSound(false);
    } else {
      sfx.unlock();
      sfx.play('tick');
      setSound(true);
    }
  };

  const S = film.scenes;
  return (
    <div ref={root}>
      <div
        className="film-box"
        role="img"
        aria-label={`${film.title} ${film.note} Full text in the transcript below.`}
      >
        {/* 1 */}
        <div className="fs s1">
          <div className="mini-card" style={{ left: '7cqi', top: '12cqi' }}>
            <img src="/insignar/card-front.svg" alt="" />
          </div>
          <div className="abs" style={{ left: '42cqi', top: '11cqi', width: '52cqi' }}>
            <p className="big q-line">“Tickets double</p>
            <p className="big q-line">after every release.”</p>
            <p style={{ marginTop: '2cqi' }}>
              <span className="chip" style={{ color: '#ece9e2', borderColor: '#6d6a62' }}>
                Card {U.cardNo}
              </span>
            </p>
          </div>
          <Cap i={0} />
        </div>
        {/* 2 */}
        <div className="fs s2">
          <div className="pnl" style={{ left: '8cqi', top: '7cqi', width: '56cqi' }}>
            <p className="m">{U.emailTag}</p>
            {U.email.map((l) => (
              <p
                key={l}
                className="em"
                style={{ fontSize: '2.1cqi', margin: '1.4cqi 0', color: '#34332f' }}
              >
                {l}
              </p>
            ))}
          </div>
          <p
            className="abs gone"
            style={{
              left: '68cqi',
              top: '14cqi',
              width: '26cqi',
              fontFamily: 'var(--f-display)',
              fontWeight: 700,
              fontSize: '3.2cqi',
              lineHeight: 1.05,
              color: '#ece9e2',
            }}
          >
            His problem is nowhere on it.
          </p>
          <Cap i={1} />
        </div>
        {/* 3 */}
        <div className="fs s3">
          <div className="wavebox abs" style={{ left: '7cqi', top: '10cqi', width: '48cqi' }}>
            <p
              className="m"
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
            <div className="wave" style={{ marginTop: '2cqi' }}>
              {WAVE.map((_, i) => (
                <i key={i} />
              ))}
            </div>
          </div>
          <div className="pnl page" style={{ left: '46cqi', top: '12cqi', width: '46cqi' }}>
            <p className="m">{U.pageTitle}</p>
            <p className="t" style={{ fontSize: '4cqi', marginTop: '1cqi' }}>
              “Tickets double after every release.”
            </p>
            <div className="bar" style={{ width: '70%' }} />
            <div className="bar" style={{ width: '45%' }} />
          </div>
          <Cap i={2} />
        </div>
        {/* 4 */}
        <div className="fs s4">
          <div className="pnl" style={{ left: '10cqi', top: '7cqi', width: '80cqi' }}>
            <p className="m">
              {U.costTitle}{' '}
              <span className="tag ex" style={{ fontSize: '1.2cqi' }}>
                EXAMPLE
              </span>
            </p>
            <p className="t" style={{ fontSize: '6cqi', marginTop: '1cqi' }}>
              {U.costRange}
            </p>
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
                className="chip tick"
                style={{ color: 'var(--verm-ink)', borderColor: 'var(--verm-ink)' }}
              >
                ✓ {U.confirmed}
              </span>
            </p>
          </div>
          <Cap i={3} />
        </div>
        {/* 5 */}
        <div className="fs s5">
          <div
            className="pnl"
            style={{ left: '4cqi', top: '8cqi', width: '28cqi', height: '27cqi' }}
          >
            <p className="m">{U.heard}</p>
            <p className="t" style={{ marginTop: '1cqi' }}>
              “Tickets double after every release.”
            </p>
            <p className="m" style={{ color: '#65625c', marginTop: '1.4cqi' }}>
              {U.heardBy}
            </p>
          </div>
          <div
            className="pnl"
            style={{ left: '36cqi', top: '8cqi', width: '28cqi', height: '27cqi' }}
          >
            <p className="m">{U.team}</p>
            <p style={{ fontSize: '2.1cqi', marginTop: '1.2cqi', color: '#34332f' }}>
              {U.teamBody}
            </p>
          </div>
          <div
            className="pnl"
            style={{ left: '68cqi', top: '8cqi', width: '28cqi', height: '27cqi' }}
          >
            <p className="m">3 steps</p>
            <ol
              style={{
                fontSize: '2.1cqi',
                paddingLeft: '2.4cqi',
                margin: '1.2cqi 0 0',
                color: '#34332f',
              }}
            >
              {U.howSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
          <Cap i={4} />
        </div>
        {/* 6 */}
        <div className="fs s6">
          <div className="mini-card" style={{ left: '8cqi', top: '14cqi', width: '30cqi' }}>
            <img src="/insignar/card-back.svg" alt="" />
          </div>
          <svg
            className="abs"
            style={{
              left: '8cqi',
              top: '14cqi',
              width: '30cqi',
              height: '20cqi',
              overflow: 'visible',
            }}
            viewBox="0 0 91 61"
            aria-hidden="true"
          >
            {[0, 1, 2].map((i) => (
              <circle
                key={i}
                className="ring"
                cx="30"
                cy="30.5"
                r="26"
                fill="none"
                stroke="#f2491c"
                strokeWidth="0.8"
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              />
            ))}
          </svg>
          <div className="pnl page" style={{ left: '52cqi', top: '7cqi', width: '40cqi' }}>
            <p className="m">{U.pageTitle}</p>
            <p className="t" style={{ marginTop: '1cqi' }}>
              “Tickets double after every release.”
            </p>
            <div className="bar" style={{ width: '75%' }} />
            <div className="bar" style={{ width: '50%' }} />
            <p
              className="rm"
              style={{ fontSize: '1.7cqi', textDecoration: 'underline', marginTop: '2cqi' }}
            >
              {U.remove}
            </p>
            <p className="fw" style={{ fontSize: '1.5cqi', color: '#65625c', marginTop: '.6cqi' }}>
              Forward to your team{' '}
              <span className="tag ex" style={{ fontSize: '1.1cqi' }}>
                {U.concept}
              </span>
            </p>
          </div>
          <Cap i={5} />
        </div>
        {/* 7 */}
        <div className="fs s7">
          <div className="pnl" style={{ left: '10cqi', top: '8cqi', width: '44cqi' }}>
            <p className="m">Thursday</p>
            <div className="slots" style={{ marginTop: '1.4cqi' }}>
              {Array.from({ length: SLOTS }, (_, i) => (
                <i key={i} className={i === 6 ? 'pick' : undefined} />
              ))}
            </div>
          </div>
          <div className="pnl meet" style={{ left: '58cqi', top: '8cqi', width: '32cqi' }}>
            <p className="m">
              <span className="tag ex" style={{ fontSize: '1.1cqi' }}>
                EXAMPLE
              </span>
            </p>
            <p className="t" style={{ marginTop: '1cqi' }}>
              {U.meeting}
            </p>
            <p style={{ fontSize: '1.8cqi', color: '#34332f', marginTop: '.8cqi' }}>
              {U.meetingWho}
            </p>
            <p style={{ fontSize: '1.5cqi', color: '#65625c', marginTop: '1.2cqi' }}>
              {U.group}{' '}
              <span className="tag ex" style={{ fontSize: '1.1cqi' }}>
                {U.concept}
              </span>
            </p>
          </div>
          <Cap i={6} />
        </div>
        {/* 8 */}
        <div className="fs s8" style={{ textAlign: 'center' }}>
          <img
            className="mk abs"
            src="/brand/insignar-mark-white.png"
            alt=""
            style={{ left: '46cqi', top: '8cqi', width: '8cqi' }}
          />
          <p
            className="big abs"
            style={{ left: '12cqi', right: '12cqi', top: '20cqi', fontSize: '6.4cqi' }}
          >
            {S[7]?.line.replace('INSIGNAR. ', '')}
          </p>
          <span
            className="btn cta2 abs"
            style={{
              left: '50%',
              top: '38cqi',
              transform: 'translateX(-50%)',
              fontSize: '2cqi',
              minHeight: '5.6cqi',
              padding: '0 3cqi',
              background: '#f2491c',
              color: '#121211',
              borderColor: '#f2491c',
            }}
          >
            Request a pilot
          </span>
          <Cap i={7} />
        </div>
      </div>

      <div className="film-bar">
        <button type="button" className="btn" onClick={toggle}>
          {ended ? film.replay : playing ? film.pause : film.play}
        </button>
        <div className="prog" aria-hidden="true">
          <i />
        </div>
        <button type="button" className="btn ghost" aria-pressed={sound} onClick={toggleSound}>
          {sound ? film.soundOff : film.soundOn}
        </button>
      </div>
      <p className="note">{film.note}</p>

      <h3 className="fig" style={{ marginTop: 22 }}>
        {film.transcript}
      </h3>
      <ol className="transcript">
        {S.map((s) => (
          <li key={s.t}>
            <time>{s.t}</time>
            <span>{s.line}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
