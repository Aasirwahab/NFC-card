'use client';

import { useEffect, useRef, useState } from 'react';
import { film } from '@/app/(marketing)/insignar/copy';

export function FilmVideo() {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(false);

  useEffect(() => {
    const element = video.current;
    if (!element || !box.current) return;
    // Entering the view starts playback and never touches the sound the visitor chose.
    // Leaving the view pauses and re-mutes, so the film is never audible off screen.
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          element.play().catch(() => {});
        }
      } else {
        element.pause();
        element.muted = true;
      }
    });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  const togglePlayback = () => {
    if (video.current?.paused) video.current.play().catch(() => {});
    else video.current?.pause();
  };

  // One tap must work: unmute and (re)start playback inside the same user gesture,
  // because muted autoplay may have been blocked or paused. The label follows the
  // element's real state (volumechange), never a guess.
  const toggleSound = () => {
    const element = video.current;
    if (!element) return;
    element.muted = !element.muted;
    if (!element.muted) element.play().catch(() => {});
  };

  return (
    <>
      <div className="film-box" ref={box}>
        <video
          ref={video}
          className="film-video"
          src="/insignar/film/insignar-v11-16x9.mp4"
          poster="/insignar/film/poster-16x9.jpg"
          aria-label={film.title}
          muted
          playsInline
          loop
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onVolumeChange={(event) => setSound(!event.currentTarget.muted)}
        />
      </div>
      <div className="film-bar">
        <button className="btn" type="button" onClick={togglePlayback}>
          {playing ? film.pause : film.play}
        </button>
        <button className="btn ghost" type="button" onClick={toggleSound} aria-pressed={sound}>
          {sound ? film.soundOff : film.soundOn}
        </button>
      </div>
      <p className="note">{film.note}</p>
      <p className="note">{film.voiceNote}</p>
    </>
  );
}
