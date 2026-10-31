import Link from 'next/link';
import styles from '@/app/ui-slice.module.css';
import { RepSignInLink } from './rep-sign-in-link';

/**
 * The generic 404 (spec §8, §22.2).
 *
 * Shown for an unknown code, a malformed code, and a card with no live session.
 * All three are BYTE-IDENTICAL: nothing in this response
 * distinguishes "no such card" from "card exists but has no session", which is
 * what makes walking the code space useless.
 *
 * It is also, deliberately, not an error page. Someone holding a real card in a
 * hotel lobby should see something branded and calm, not a stack trace.
 */
export default function CardNotFound() {
  return (
    <div className={`${styles.surface} ${styles.publicPage}`}>
      <main className="flex-1 pt-16">
        <h1 className={styles.headline}>This page isn&rsquo;t available</h1>
        <p className={styles.companyLine}>
          The link may have been removed, or it is not active. If someone gave you this card, ask
          them to send the link again.
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
          <RepSignInLink />
        </div>
      </footer>
    </div>
  );
}
