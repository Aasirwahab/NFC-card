import Link from 'next/link';
import styles from '@/app/ui-slice.module.css';

/**
 * Shown when the database could not be reached (§16, §24.3).
 *
 * Deliberately NOT the generic 404. "This card is not active" is the right thing
 * to say to someone holding a code that does not exist, and exactly the wrong
 * thing to say to someone holding a perfectly good card during an outage —
 * they would throw it away, and the card is the product.
 *
 * Still no raw error, no status code, no stack trace. Just the honest version.
 *
 * Phase 6 makes this rarer: the service worker serves a cached branded page when
 * Supabase is unreachable (§24.3). This is what is behind that.
 */
export function Unavailable() {
  return (
    <div className={`${styles.surface} ${styles.publicPage}`}>
      <main className="flex-1 pt-16">
        <h1 className={styles.headline}>Can&rsquo;t load this right now</h1>
        <p className={styles.companyLine}>
          Try again in a minute. If it keeps happening, open the link later.
        </p>
      </main>
      <footer className={styles.footer}>
        <div className="flex gap-4">
          <Link href="/how-it-works" className="underline underline-offset-2">
            How it works
          </Link>
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}
