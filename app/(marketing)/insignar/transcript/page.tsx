import type { Metadata } from 'next';
import Link from 'next/link';
import { film } from '../copy';
import '../insignar.css';

export const metadata: Metadata = {
  title: 'The film, as text',
  description: film.title,
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
