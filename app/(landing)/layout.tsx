import Link from 'next/link';
import { Wordmark } from '@/components/brand';
import { SmoothScroll } from '@/components/insignar/smooth-scroll';
import { footer, nav } from './insignar/copy';
import './insignar/insignar.css';

/** The landing's own frame: full-width sticky header with the pilot button, one footer. */
export default function LandingLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <SmoothScroll />
      <header className="ins ins-top">
        <div className="wrap">
          <Link href="/" aria-label={nav.home}>
            <Wordmark />
          </Link>
          <nav>
            <Link href="/sign-in" className="signin">
              {nav.signIn}
            </Link>
            <a className="btn" href="/#pilot">
              {nav.pilot}
            </a>
          </nav>
        </div>
      </header>

      {children}

      <footer className="ins foot">
        <div className="wrap">
          <span>{footer.line}</span>
          <nav>
            <Link href="/insignar/transcript">{footer.readFilm}</Link>
            <Link href="/facts">{footer.facts}</Link>
            <Link href="/vs/digital-business-cards">{footer.compare}</Link>
            <Link href="/privacy">{footer.privacy}</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
