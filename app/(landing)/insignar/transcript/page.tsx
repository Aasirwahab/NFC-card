import type { Metadata } from 'next';
import Link from 'next/link';
import { OG_IMAGE } from '@/lib/site';
import { film } from '../copy';
import '../insignar.css';

export const metadata: Metadata = {
  title: 'The INSIGNAR film, as text',
  description:
    'A plain-text version of the INSIGNAR film: what the rep says and what the prospect sees, beat by beat, for readers who skip video.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/insignar/transcript' },
  openGraph: {
    title: 'The INSIGNAR film, as text',
    url: '/insignar/transcript',
    images: [OG_IMAGE],
  },
};

/** Plain-text version of the film for readers who skip video or use assistive tech. */
export default function TranscriptPage() {
  return (
    <div className="ins" data-m="on">
      <main className="wrap tx">
        <p className="fig">{film.label}</p>
        <h1 style={{ marginTop: 12 }}>{film.title}</h1>
        <p className="note">{film.note}</p>
        <ol>
          {film.beats.map((b) => (
            <li key={b.t + b.start}>
              <time>{b.t}</time>
              <span>{b.line || film.silence}</span>
            </li>
          ))}
        </ol>
        <p style={{ marginTop: 32 }}>
          <Link href="/insignar">Back to INSIGNAR</Link>
        </p>
      </main>
    </div>
  );
}
