import Link from 'next/link';

/**
 * The small "← Parent" link at the top of a page. It always goes to a fixed
 * parent, never history.back(): a page opened from a card tap or an email has
 * no in-app history to go back to.
 */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-ink-3 hover:text-ink-2 text-[13px] underline underline-offset-2"
    >
      ← {children}
    </Link>
  );
}
